import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";

const boundary = await verifyStagingBoundary();
const { projectId } = boundary;
const password = String(process.env.SANDMAN_STAGING_TEST_PASSWORD || "");
if (password.length < 12) throw new Error("Provide a staging-only test password of at least 12 characters.");

const app = initializeApp({ credential: cert(boundary.credential), projectId }, `sandman-staging-${Date.now()}`);
if (app.options.projectId !== projectId) throw new Error("Initialized Firebase target does not match the authorized staging project.");
const auth = getAuth(app);
const db = getFirestore(app);
const users = [
  ["staging-coach-wrestling", "coach.wrestling@example.invalid", "Synthetic Wrestling Coach"],
  ["staging-outsider-coach", "coach.outsider@example.invalid", "Synthetic Outside Coach"],
];
const existingUsers = new Map();
for (const [uid, email] of users) {
  try {
    const user = await auth.getUser(uid);
    if (user.email !== email || user.customClaims?.synthetic !== true) throw new Error(`Refusing to overwrite non-synthetic Auth user ${uid}.`);
    existingUsers.set(uid, user);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }
}

const protectedPaths = [
  "staff/staging-coach-wrestling", "staff/staging-outsider-coach",
  "athletes/staging-athlete-beginner", "athletes/staging-athlete-advanced",
  "families/staging-family", "practiceSessions/staging-wrestling-practice",
  "attendance_sessions/staging-wrestling-practice", "stagingMetadata/wrestling-auto",
];
for (const snapshot of await db.getAll(...protectedPaths.map(path => db.doc(path)))) {
  if (snapshot.exists && snapshot.get("synthetic") !== true && snapshot.get("syntheticDataOnly") !== true) {
    throw new Error(`Refusing to overwrite non-synthetic Firestore record ${snapshot.ref.path}.`);
  }
}

for (const [uid, email, displayName] of users) {
  if (existingUsers.has(uid)) await auth.updateUser(uid, { password, displayName, disabled: false });
  else {
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
    await auth.setCustomUserClaims(uid, { synthetic: true, environment: "staging" });
  }
}
const now = Timestamp.now();
const batch = db.batch();
const set = (path, value) => batch.set(db.doc(path), value, { merge: true });
set("staff/staging-coach-wrestling", { role: "coach", status: "active", locationIds: ["staging-location"], academyIds: ["staging-academy"], synthetic: true });
set("staff/staging-outsider-coach", { role: "coach", status: "active", locationIds: ["outside-location"], synthetic: true });
set("athletes/staging-athlete-beginner", { displayName: "Synthetic Beginner", locationId: "staging-location", academyId: "staging-academy", coachIds: ["staging-coach-wrestling"], synthetic: true });
set("athletes/staging-athlete-advanced", { displayName: "Synthetic Advanced", locationId: "staging-location", academyId: "staging-academy", coachIds: ["staging-coach-wrestling"], synthetic: true });
set("families/staging-family", { displayName: "Synthetic Family", athleteIds: ["staging-athlete-beginner", "staging-athlete-advanced"], synthetic: true });
set("practiceSessions/staging-wrestling-practice", { coachUid: "staging-coach-wrestling", locationId: "staging-location", academyId: "staging-academy", discipline: "wrestling", sessionDateKey: "2099-01-01", status: "open", synthetic: true, createdAt: now });
set("attendance_sessions/staging-wrestling-practice", { practiceId: "staging-wrestling-practice", discipline: "wrestling", status: "pending", finalized: false, checkedInIds: ["staging-athlete-beginner", "staging-athlete-advanced"], synthetic: true });
set("practiceSessions/staging-wrestling-practice/athletes/staging-athlete-beginner", { practiceId: "staging-wrestling-practice", athleteId: "staging-athlete-beginner", discipline: "wrestling", attendance: { status: "present" }, synthetic: true });
set("practiceSessions/staging-wrestling-practice/athletes/staging-athlete-advanced", { practiceId: "staging-wrestling-practice", athleteId: "staging-athlete-advanced", discipline: "wrestling", attendance: { status: "present" }, synthetic: true });
for (const familyId of ["stance_motion", "level_change_entry", "angle", "head_position", "distance", "double_leg"]) {
  set(`practiceSessions/staging-wrestling-practice/athletes/staging-athlete-advanced/verifiedSkills/wrestling__${familyId}`, { discipline: "wrestling", familyId, state: "APPLIED", coachUid: "staging-coach-wrestling", verifiedAt: now, synthetic: true });
}
set("stagingMetadata/wrestling-auto", { environment: "staging", projectId, syntheticDataOnly: true, unattendedAuto: false, seededAt: FieldValue.serverTimestamp() });
await batch.commit();
console.log(`Seeded synthetic Wrestling staging data in ${projectId}.`);
await deleteApp(app);
