import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Firestore } from "@google-cloud/firestore";
import { writeFileSync } from "node:fs";
import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";
import { commitSyntheticManifestTransaction } from "./staging-seed-safety.mjs";

const project = "sandman-combat-staging";
const locationId = "santa-ynez-valley";
const ownAthlete = "staging-athlete-beginner";
const otherAthlete = "staging-athlete-intermediate";
const intake = "staging-p0-intake";
const proposal = "staging-p0-proposal";
const xpLog = "staging-p0-xp";
const roles = {
  management: { uid: "staging-p0-management", readySelector: "#managerIdentity" },
  coach: { uid: "staging-coach-wrestling", readySelector: "#coachSystemTitle" },
  parent: { uid: "staging-p0-parent", readySelector: "#familyAthleteSnapshot" },
  athlete: { uid: ownAthlete, readySelector: "#athleteStatusGrid" },
  admin: { uid: "staging-p0-admin", readySelector: "#adminIdentity" },
};
const fixtures = {
  roles, ownAthlete, otherAthlete, intake, proposal, xpLog,
  intakeStatus: "submitted", proposalStatus: "PAID", paymentStatus: "paid",
  progressionField: "rank",
};
const require = (condition, reason) => {
  if (!condition) throw new Error(reason);
};

require(process.env.GITHUB_REPOSITORY === "raulsandoval81-maker/SandmanSystem" &&
  process.env.GITHUB_WORKFLOW_REF ===
    "raulsandoval81-maker/SandmanSystem/.github/workflows/seed-mixed-journey-staging-roster.yml@refs/heads/main" &&
  process.env.GITHUB_RUN_ATTEMPT === "1" &&
  process.env.P0_FIXTURE_APPROVAL === "SEED-P0-SYNTHETIC-FIXTURES", "Staging fixture guard failed");
require((await verifyStagingBoundary()).projectId === project, "Wrong Firebase project");
const password = process.env.SANDMAN_STAGING_TEST_PASSWORD || "";
const accessToken = process.env.SANDMAN_STAGING_ACCESS_TOKEN || "";
require(password.length >= 12 && accessToken, "Protected credentials unavailable");
const app = initializeApp({ projectId: project, credential: {
  getAccessToken: async () => ({ access_token: accessToken, expires_in: 3600 }),
} }, "p0-staging-fixtures");
const auth = getAuth(app);
const db = new Firestore({ projectId: project });
let current = "verify existing synthetic records";
try {
  const [athlete, other, coach] = await db.getAll(...[
    `athletes/${ownAthlete}`, `athletes/${otherAthlete}`, `staff/${roles.coach.uid}`,
  ].map(path => db.doc(path)));
  require([athlete, other, coach].every(s => s.get("synthetic") === true), "Synthetic seed records unavailable");
  require(athlete.get("locationId") === locationId && athlete.get("rank") !== undefined &&
    [null, undefined, ownAthlete].includes(athlete.get("authUid")), "Seeded athlete ownership differs");
  require(coach.get("role") === "coach" && coach.get("status") === "active", "Coach role differs");

  current = "verify synthetic Auth identities";
  for (const uid of [roles.coach.uid, "staging-outsider-coach"]) {
    const user = await auth.getUser(uid);
    require(user.customClaims?.synthetic === true && user.customClaims?.environment === "staging" &&
      !user.disabled && /@example\.(com|org|net|invalid)$/.test(user.email ?? ""), "Coach claim mismatch");
    if (uid === roles.coach.uid) roles.coach.email = user.email;
  }
  const missing = [];
  for (const [role, fixture] of Object.entries(roles)) {
    if (role === "coach") continue;
    fixture.email = `${fixture.uid}@example.invalid`;
    try {
      const user = await auth.getUser(fixture.uid);
      require(user.email === fixture.email && !user.disabled && user.customClaims?.synthetic === true &&
        user.customClaims?.environment === "staging", "Existing Auth identity differs");
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      missing.push(fixture);
    }
  }

  const parentUid = roles.parent.uid;
  const records = new Map(Object.entries({
    [`staff/${roles.management.uid}`]: { role: "management", status: "active", locationIds: [locationId] },
    [`staff/${roles.admin.uid}`]: { role: "admin", status: "active", locationIds: [locationId] },
    [`parents/${parentUid}`]: { uid: parentUid, primaryAthleteUid: ownAthlete, status: "active" },
    [`parentAthleteLinks/${parentUid}_${ownAthlete}`]: { parentUid, athleteUid: ownAthlete, status: "active" },
    [`intakes/${intake}`]: { proposalId: proposal, ownerUid: parentUid, status: fixtures.intakeStatus, locationId },
    [`proposals/${proposal}`]: { status: fixtures.proposalStatus, paymentStatus: fixtures.paymentStatus, locationId },
    [`athletes/${ownAthlete}/xpLogs/${xpLog}`]: { uid: ownAthlete, xp: 5, kind: "synthetic-fixture" },
  }).map(([path, fields]) => [path, { ...fields, synthetic: true }]));
  current = "verify fixture paths before writes";
  const recordSnapshots = await db.getAll(...[...records.keys()].map(path => db.doc(path)));
  for (const snapshot of recordSnapshots) {
    if (!snapshot.exists) continue;
    for (const [key, expected] of Object.entries(records.get(snapshot.ref.path))) {
      require(JSON.stringify(snapshot.get(key)) === JSON.stringify(expected), "Existing fixture differs");
    }
  }
  const unrelated = await db.doc(`parentAthleteLinks/${parentUid}_${otherAthlete}`).get();
  require(!unrelated.exists, "Unexpected cross-family fixture link");
  current = "create missing synthetic Auth users";
  for (const fixture of missing) {
    await auth.createUser({ uid: fixture.uid, email: fixture.email, password, emailVerified: true });
    await auth.setCustomUserClaims(fixture.uid, { synthetic: true, environment: "staging" });
  }
  current = "create missing synthetic Firestore documents";
  const writes = new Map(recordSnapshots.filter(snapshot => !snapshot.exists)
    .map(snapshot => [snapshot.ref.path, records.get(snapshot.ref.path)]));
  if (writes.size) await commitSyntheticManifestTransaction(db, writes, { createOnly: true });
  writeFileSync("p0-staging-fixtures.json", JSON.stringify(fixtures, null, 2) + "\n");
  console.log(JSON.stringify({ status: "PASS", createdAccounts: missing.length, createdDocuments: writes.size }));
} catch {
  console.error(JSON.stringify({ status: "STOP_NO_RETRY", phase: current }));
  process.exitCode = 1;
} finally {
  await db.terminate();
  await deleteApp(app);
}
