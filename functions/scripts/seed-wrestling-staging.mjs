import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";
import { assertSyntheticWriteSafety, commitSyntheticManifestTransaction } from "./staging-seed-safety.mjs";

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
const now = Timestamp.now();
const historicalDate = Timestamp.fromDate(new Date("2026-09-15T18:00:00.000Z"));
const staleDate = Timestamp.fromDate(new Date("2020-01-01T18:00:00.000Z"));
const roster = ["staging-athlete-beginner", "staging-athlete-intermediate", "staging-athlete-advanced"];
const writes = new Map();
const stage = (path, value) => {
  if (writes.has(path)) throw new Error(`Duplicate synthetic seed path ${path}.`);
  writes.set(path, { ...value, synthetic: true });
};

stage("staff/staging-coach-wrestling", { role: "coach", status: "active", locationIds: ["staging-location"], academyIds: ["staging-academy"] });
stage("staff/staging-outsider-coach", { role: "coach", status: "active", locationIds: ["outside-location"] });
stage("athletes/staging-athlete-beginner", { displayName: "Synthetic Beginner", locationId: "staging-location", academyId: "staging-academy", coachIds: ["staging-coach-wrestling"] });
stage("athletes/staging-athlete-intermediate", { displayName: "Synthetic Intermediate", locationId: "staging-location", academyId: "staging-academy", coachIds: ["staging-coach-wrestling"] });
stage("athletes/staging-athlete-advanced", { displayName: "Synthetic Advanced", locationId: "staging-location", academyId: "staging-academy", coachIds: ["staging-coach-wrestling"] });
stage("families/staging-family", { displayName: "Synthetic Family", athleteIds: roster });
stage("practiceSessions/staging-wrestling-practice", { coachUid: "staging-coach-wrestling", locationId: "staging-location", academyId: "staging-academy", discipline: "wrestling", sessionDateKey: "2026-10-10", status: "open", createdAt: now });
stage("attendance_sessions/staging-wrestling-practice", { practiceId: "staging-wrestling-practice", discipline: "wrestling", status: "pending", finalized: false, checkedInIds: roster });
for (const athleteId of roster) {
  stage(`practiceSessions/staging-wrestling-practice/athletes/${athleteId}`, { practiceId: "staging-wrestling-practice", athleteId, discipline: "wrestling", attendance: { status: "present" } });
}

const historyPractice = "staging-wrestling-history";
stage(`practiceSessions/${historyPractice}`, { coachUid: "staging-coach-wrestling", locationId: "staging-location", academyId: "staging-academy", discipline: "wrestling", sessionDateKey: "2026-09-15", status: "closed" });
stage(`attendance_sessions/${historyPractice}`, { practiceId: historyPractice, discipline: "wrestling", status: "finalized", finalized: true, presentIds: ["staging-athlete-intermediate", "staging-athlete-advanced"] });
for (const athleteId of ["staging-athlete-intermediate", "staging-athlete-advanced"]) {
  stage(`practiceSessions/${historyPractice}/athletes/${athleteId}`, { practiceId: historyPractice, athleteId, discipline: "wrestling", attendance: { status: "present" } });
}
for (const familyId of ["stance_motion", "level_change_entry"]) {
  stage(`practiceSessions/${historyPractice}/athletes/staging-athlete-intermediate/verifiedSkills/wrestling__${familyId}`, { discipline: "wrestling", familyId, state: "LEARNED", coachUid: "staging-coach-wrestling", verifiedAt: historicalDate });
}
for (const familyId of ["stance_motion", "level_change_entry", "angle", "head_position", "distance", "double_leg"]) {
  stage(`practiceSessions/${historyPractice}/athletes/staging-athlete-advanced/verifiedSkills/wrestling__${familyId}`, { discipline: "wrestling", familyId, state: "APPLIED", coachUid: "staging-coach-wrestling", verifiedAt: historicalDate });
}

const stalePractice = "staging-wrestling-stale-evidence";
stage(`practiceSessions/${stalePractice}`, { coachUid: "staging-coach-wrestling", locationId: "staging-location", academyId: "staging-academy", discipline: "wrestling", sessionDateKey: "2020-01-01", status: "closed", evidenceScenario: "stale" });
stage(`attendance_sessions/${stalePractice}`, { practiceId: stalePractice, discipline: "wrestling", status: "finalized", finalized: true, presentIds: ["staging-athlete-intermediate"], evidenceScenario: "stale" });
stage(`practiceSessions/${stalePractice}/athletes/staging-athlete-intermediate`, { practiceId: stalePractice, athleteId: "staging-athlete-intermediate", discipline: "wrestling", attendance: { status: "present" }, evidenceScenario: "stale" });
stage(`practiceSessions/${stalePractice}/athletes/staging-athlete-intermediate/verifiedSkills/wrestling__single_leg`, { discipline: "wrestling", familyId: "single_leg", state: "LEARNED", coachUid: "staging-coach-wrestling", verifiedAt: staleDate, evidenceScenario: "stale" });

const conflictPractice = "staging-wrestling-conflicting-evidence";
stage(`practiceSessions/${conflictPractice}`, { coachUid: "staging-coach-wrestling", locationId: "staging-location", academyId: "staging-academy", discipline: "wrestling", sessionDateKey: "2026-09-15", status: "closed", evidenceScenario: "conflicting" });
stage(`attendance_sessions/${conflictPractice}`, { practiceId: conflictPractice, discipline: "wrestling", status: "finalized", finalized: true, presentIds: ["staging-athlete-advanced"], evidenceScenario: "conflicting" });
stage(`practiceSessions/${conflictPractice}/athletes/staging-athlete-advanced`, { practiceId: conflictPractice, athleteId: "staging-athlete-advanced", discipline: "wrestling", attendance: { status: "present" }, evidenceScenario: "conflicting" });
stage(`practiceSessions/${conflictPractice}/athletes/staging-athlete-advanced/verifiedSkills/wrestling__double_leg`, { discipline: "wrestling", familyId: "double_leg", state: "LEARNED", coachUid: "staging-coach-wrestling", verifiedAt: historicalDate, evidenceScenario: "conflicting" });

stage("coachLessonPlans/staging-interrupted-draft", { kind: "COACH_AUTHORED_GROUP_LESSON", status: "DRAFT", coachUid: "staging-coach-wrestling", discipline: "wrestling", familyId: "double_leg", athleteIds: roster, tracks: roster.map((athleteId, index) => ({ athleteId, track: ["INTRODUCE", "PRACTICE", "EXTEND"][index] })), sourcePracticeId: "staging-wrestling-practice", eligibleForAuto: false, lessonExecuted: false, xpAwarded: false, scenario: "interrupted-recovery" });
stage("stagingMetadata/wrestling-auto", { environment: "staging", projectId, syntheticDataOnly: true, unattendedAuto: false, roster, scenarios: ["missing-evidence", "stale-evidence", "conflicting-evidence", "interrupted-recovery", "duplicate-retry"], seededAt: FieldValue.serverTimestamp() });

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

const intendedPaths = [...writes.keys()];
const snapshots = await db.getAll(...intendedPaths.map(path => db.doc(path)));
assertSyntheticWriteSafety(snapshots, intendedPaths);

const createdUsers = [];
try {
  for (const [uid, email, displayName] of users) {
    if (existingUsers.has(uid)) continue;
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
    createdUsers.push(uid);
    await auth.setCustomUserClaims(uid, { synthetic: true, environment: "staging" });
  }
  await commitSyntheticManifestTransaction(db, writes);
} catch (error) {
  const rollback = await Promise.allSettled(createdUsers.map(uid => auth.deleteUser(uid)));
  const rollbackFailures = rollback
    .map((result, index) => ({ result, uid: createdUsers[index] }))
    .filter(item => item.result.status === "rejected")
    .map(item => new Error(`Auth rollback failed for ${item.uid}: ${item.result.reason?.message || item.result.reason}`));
  if (rollbackFailures.length) {
    throw new AggregateError([error, ...rollbackFailures], "Synthetic seed failed and one or more Auth rollbacks also failed.");
  }
  throw error;
}
console.log(`Seeded ${writes.size} synthetic Wrestling staging records in ${projectId}.`);
await deleteApp(app);
