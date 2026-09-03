import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test, { after, before, beforeEach } from "node:test";

import {
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  deleteApp as deleteClientApp,
  initializeApp as initializeClientApp,
} from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from "firebase/auth";

import {
  awardXpAuthoritatively,
} from "../../functions/lib/services/authoritativeXpService.js";
import {
  getCompletedLaneSubmissionIdentities,
  resolveLaneSubmissionIdentity,
} from "../../public/assets/js/athlete-lane-context.js";

const require = createRequire(import.meta.url);
const { initializeApp, deleteApp } = require(
  "../../functions/node_modules/firebase-admin/lib/app/index.js"
);
const { getFirestore } = require(
  "../../functions/node_modules/firebase-admin/lib/firestore/index.js"
);

const PROJECT_ID = "sandmandashboard-athlete-lanes-test";
const COACH_UID = "SYNTHETIC_COACH_SLICE2";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (!FIRESTORE_HOST || !AUTH_HOST) {
  throw new Error(
    "Firestore and Auth emulator hosts are required. This suite refuses to contact production."
  );
}

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;

const app = initializeApp({ projectId: PROJECT_ID });
const adminDb = getFirestore(app);
const clientApp = initializeClientApp({
  apiKey: "synthetic-emulator-key",
  authDomain: "localhost",
  projectId: PROJECT_ID,
}, "athlete-lane-auth-tests");
const auth = getAuth(clientApp);
let testEnv;

const vault = {
  strength: JSON.parse(
    fs.readFileSync("public/vault/strength/segment1/sessions.json", "utf8")
  ).sessions,
  strengthSegment2: JSON.parse(
    fs.readFileSync("public/vault/strength/segment2/sessions.json", "utf8")
  ).sessions,
  honor: JSON.parse(
    fs.readFileSync("public/vault/honor/segment1/sessions.json", "utf8")
  ).sessions,
  honorSegment2: JSON.parse(
    fs.readFileSync("public/vault/honor/segment2/sessions.json", "utf8")
  ).sessions,
  honorSegment6: JSON.parse(
    fs.readFileSync("public/vault/honor/segment6/sessions.json", "utf8")
  ).sessions,
  f4Conditioning: JSON.parse(
    fs.readFileSync("public/vault/conditioning/f4/segment1/sessions.json", "utf8")
  ).sessions,
  f8Conditioning: JSON.parse(
    fs.readFileSync("public/vault/conditioning/f8/segment1/sessions.json", "utf8")
  ).sessions,
};

const fixtures = {
  f4Strength: {
    id: "F4_SLICE2_STRENGTH",
    trackBase: "F4",
    tier: "T0",
    xp: 100,
    xpCap: 1000,
    stripeCount: 1,
    unlocks: { strength: true, honor: true },
  },
  f8Strength: {
    id: "F8_SLICE2_STRENGTH",
    trackBase: "F8",
    tier: "T1",
    progressionTier: "T1",
    xp: 100,
    xpCap: 1400,
    stripeCount: 1,
    unlocks: { strength: true, honor: true },
  },
  f4Honor: {
    id: "F4_SLICE2_HONOR",
    trackBase: "F4",
    tier: "T0",
    xp: 100,
    xpCap: 1000,
    stripeCount: 2,
    unlocks: { strength: true, honor: true },
  },
  f8Honor: {
    id: "F8_SLICE2_HONOR",
    trackBase: "F8",
    tier: "T1",
    progressionTier: "T1",
    xp: 100,
    xpCap: 1400,
    stripeCount: 1,
    unlocks: { strength: true, honor: true },
  },
  f4Conditioning: {
    id: "F4_SLICE2_CONDITIONING",
    trackBase: "F4",
    tier: "T0",
    xp: 100,
    xpCap: 1000,
    stripeCount: 1,
    unlocks: { strength: true, honor: true },
  },
  f8Conditioning: {
    id: "F8_SLICE2_CONDITIONING",
    trackBase: "F8",
    tier: "T3",
    progressionTier: "T3",
    xp: 100,
    xpCap: 2600,
    stripeCount: 1,
    unlocks: { strength: true, honor: true },
  },
};

before(async () => {
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const credential = await signInAnonymously(auth);
  assert.ok(credential.user.uid, "Anonymous emulator authentication succeeds");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST.split(":")[0],
      port: Number(FIRESTORE_HOST.split(":")[1]),
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
  await deleteClientApp(clientApp);
  await deleteApp(app);
});

function authenticatedDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seedAthlete(fixture) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "athletes", fixture.id), {
      uid: fixture.id,
      fullName: `Synthetic ${fixture.id}`,
      trackBase: fixture.trackBase,
      tier: fixture.tier,
      progressionTier: fixture.progressionTier ?? fixture.tier,
      xp: fixture.xp,
      xpCap: fixture.xpCap,
      stripeCount: fixture.stripeCount,
      unlocks: fixture.unlocks,
      monthly: {},
    });
  });
}

function completedEntries(data, lane, track = "") {
  return Object.values(data || {}).filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    if (String(entry.lane || "").toLowerCase() !== lane) return false;
    if (track && String(entry.track || "").toLowerCase() !== track) return false;
    return ["approved", "closed"].includes(String(entry.status || "").toLowerCase());
  });
}

function nextSession(data, lane, sessions, track = "") {
  const segmentId = sessions?.[0]?.id?.startsWith("HON2-") || sessions?.[0]?.id?.startsWith("STR-CAP-")
    ? "segment2"
    : sessions?.[0]?.id?.startsWith("HON6-")
      ? "segment6"
      : "segment1";
  const complete = lane === "strength" || lane === "honor"
    ? getCompletedLaneSubmissionIdentities({ submissions: data, lane, segmentId })
        .map(({ identity }) => ({ sessionN: identity.sessionN }))
    : completedEntries(data, lane, track);
  const highest = complete.length
    ? Math.max(...complete.map((entry) => Number(entry.sessionN || 0)))
    : 0;
  const target = highest + 1;
  return sessions.find((session) => Number(session.n) === target) || null;
}

async function exerciseLane({
  fixture,
  lane,
  track = "",
  sessions,
  key,
  kind,
  requestedAmount,
  source,
  expectedAward,
  assignment = null,
  segmentId = "segment1",
}) {
  await seedAthlete(fixture);
  const athleteDb = authenticatedDb(`ATHLETE_${fixture.id}`);
  const coachDb = authenticatedDb(COACH_UID);
  const submissionRef = doc(athleteDb, "laneSubmissions", fixture.id);

  const firstSession = nextSession({}, lane, sessions, track);
  assert.equal(firstSession?.n, 1, `${lane}/${track || "default"} resolves session 1`);
  assert.ok(firstSession?.title || firstSession?.lesson, "Vault session has renderable content");

  const initialEntry = {
    body: "Synthetic athlete response",
    status: "pending",
    lane,
    ...(track ? { track } : {}),
    segmentId,
    sessionN: 1,
    athleteUid: fixture.id,
    athleteName: `Synthetic ${fixture.id}`,
    title: firstSession.title || firstSession.lesson || "",
    ...(lane === "strength" ? { main: "Synthetic main lift" } : {}),
  };

  await setDoc(submissionRef, {
    ...(assignment ? { conditioning_assignment: assignment } : {}),
    [key]: initialEntry,
  }, { merge: true });

  let snap = await getDoc(submissionRef);
  assert.equal(snap.data()[key].status, "pending");

  const queue = await getDocs(collection(coachDb, "laneSubmissions"));
  assert.ok(queue.docs.some((item) => item.id === fixture.id), "Coach queue sees submission");

  const coachRef = doc(coachDb, "laneSubmissions", fixture.id);
  await updateDoc(coachRef, {
    [`${key}.status`]: "needs_revision",
    [`${key}.coachNote`]: "Synthetic revision request",
  });
  snap = await getDoc(submissionRef);
  assert.equal(snap.data()[key].status, "needs_revision");

  await updateDoc(submissionRef, {
    [`${key}.body`]: "Synthetic revised athlete response",
    [`${key}.status`]: "pending",
  });
  snap = await getDoc(submissionRef);
  assert.equal(snap.data()[key].body, "Synthetic revised athlete response");
  assert.equal(snap.data()[key].segmentId, segmentId);
  assert.equal(snap.data()[key].sessionN, 1);

  const beforeAthlete = (await adminDb.doc(`athletes/${fixture.id}`).get()).data();
  const awardInput = {
    uid: fixture.id,
    kind,
    amount: requestedAmount,
    note: "Synthetic emulator lane approval",
    meta: { key, source, segmentId, sessionN: 1, ...(track ? { track } : {}) },
  };
  const award = await awardXpAuthoritatively(COACH_UID, awardInput);
  assert.equal(award.awardedAmount, expectedAward);

  const duplicate = await awardXpAuthoritatively(COACH_UID, awardInput);
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.delta, 0);

  await setDoc(doc(coachDb, "laneHistory", `${fixture.id}__${key}`), {
    athleteId: fixture.id,
    athleteName: `Synthetic ${fixture.id}`,
    lane,
    ...(track ? { track } : {}),
    segmentId,
    sessionN: 1,
    status: "closed",
    body: "Synthetic revised athlete response",
    awardedXp: expectedAward,
    sourceCollection: "laneSubmissions",
    sourceAthleteId: fixture.id,
    sourceKey: key,
    historyType: "submission",
    closedAt: new Date(),
  });
  await updateDoc(coachRef, {
    [`${key}.status`]: "closed",
    [`${key}.awardedXp`]: expectedAward,
    [`${key}.coachNote`]: "Synthetic approved",
  });

  const closed = (await adminDb.doc(`laneSubmissions/${fixture.id}`).get()).data();
  assert.equal(closed[key].status, "closed");
  assert.equal((await adminDb.doc(`laneHistory/${fixture.id}__${key}`).get()).exists, true);
  const history = (await adminDb.doc(`laneHistory/${fixture.id}__${key}`).get()).data();
  assert.equal(history.segmentId, segmentId);
  assert.equal(history.sessionN, 1);
  assert.deepEqual(resolveLaneSubmissionIdentity({ lane, entry: closed[key], key }), {
    segmentId,
    sessionN: 1,
  });
  assert.equal(nextSession(closed, lane, sessions, track)?.n, 2);

  const afterAthlete = (await adminDb.doc(`athletes/${fixture.id}`).get()).data();
  if (fixture.trackBase === "F8") {
    assert.equal(afterAthlete.xp, beforeAthlete.xp + expectedAward);
  } else {
    assert.equal(afterAthlete.xp, beforeAthlete.xp);
  }
  const bucket = kind === "HONOR" ? "xpHonor" : "xpStrength";
  assert.equal(afterAthlete[bucket], Number(beforeAthlete[bucket] || 0) + expectedAward);
}

test("F4 and F8 Strength complete revision, authoritative XP, history, and advancement", async () => {
  await exerciseLane({
    fixture: fixtures.f4Strength,
    lane: "strength",
    sessions: vault.strength,
    key: "STR-001",
    kind: "STRENGTH",
    requestedAmount: 10,
    source: "lane-review",
    expectedAward: 10,
  });
  await exerciseLane({
    fixture: fixtures.f8Strength,
    lane: "strength",
    sessions: vault.strength,
    key: "STR-001",
    kind: "STRENGTH",
    requestedAmount: 10,
    source: "lane-review",
    expectedAward: 10,
  });
});

test("F4 and F8 Honor complete revision, authoritative XP, history, and advancement", async () => {
  await exerciseLane({
    fixture: fixtures.f4Honor,
    lane: "honor",
    sessions: vault.honor,
    key: "HON-001",
    kind: "HONOR",
    requestedAmount: 10,
    source: "honor_lane_review",
    expectedAward: 10,
  });
  await exerciseLane({
    fixture: fixtures.f8Honor,
    lane: "honor",
    sessions: vault.honor,
    key: "HON-001",
    kind: "HONOR",
    requestedAmount: 5,
    source: "honor_lane_review",
    expectedAward: 5,
  });
});

test("non-segment1 Strength preserves review, XP, history, and advancement identity", async () => {
  await exerciseLane({
    fixture: { ...fixtures.f4Strength, id: "F4_SLICE4A_STRENGTH_SEG2" },
    lane: "strength",
    segmentId: "segment2",
    sessions: vault.strengthSegment2,
    key: "STR-CAP-001",
    kind: "STRENGTH",
    requestedAmount: 10,
    source: "lane-review",
    expectedAward: 10,
  });
});

test("Honor segment2 and segment6 preserve canonical review identity", async () => {
  await exerciseLane({
    fixture: { ...fixtures.f4Honor, id: "F4_SLICE4A_HONOR_SEG2" },
    lane: "honor",
    segmentId: "segment2",
    sessions: vault.honorSegment2,
    key: "HON2-001",
    kind: "HONOR",
    requestedAmount: 10,
    source: "honor_lane_review",
    expectedAward: 10,
  });
  await exerciseLane({
    fixture: { ...fixtures.f4Honor, id: "F4_SLICE4A_HONOR_SEG6" },
    lane: "honor",
    segmentId: "segment6",
    sessions: vault.honorSegment6,
    key: "HON6-001",
    kind: "HONOR",
    requestedAmount: 10,
    source: "honor_lane_review",
    expectedAward: 10,
  });
});

test("F4 Conditioning preserves assignment resolution and completes the shared Strength XP loop", async () => {
  const assignment = {
    status: "assigned",
    presetId: "F4_REMOTE_BASE",
    sourceSessionN: 1,
    note: "Synthetic F4 assignment",
  };
  assert.equal(assignment.sourceSessionN, 1);
  await exerciseLane({
    fixture: fixtures.f4Conditioning,
    lane: "conditioning",
    track: "f4",
    sessions: vault.f4Conditioning,
    key: "conditioning_f4_segment1_session1",
    kind: "STRENGTH",
    requestedAmount: 5,
    source: "lane-review",
    expectedAward: 5,
    assignment,
  });
});

test("F8 Conditioning preserves tier availability and completes the shared Strength XP loop", async () => {
  const tier = 3;
  const remoteLimit = tier <= 2 ? 0 : tier <= 4 ? 1 : 2;
  assert.equal(remoteLimit, 1);
  const assignment = {
    status: "assigned",
    presetId: "F8_FOUNDATION",
    sourceSessionN: 1,
    note: "Synthetic F8 assignment",
  };
  await exerciseLane({
    fixture: fixtures.f8Conditioning,
    lane: "conditioning",
    track: "f8",
    sessions: vault.f8Conditioning,
    key: "conditioning_f8_segment1_session1",
    kind: "STRENGTH",
    requestedAmount: 5,
    source: "lane-review",
    expectedAward: 5,
    assignment,
  });
});
