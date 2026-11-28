"use strict";
// Real Firestore emulator acceptance for atomic group confirmation.
// Run under: firebase emulators:exec --only firestore ... 'npm --prefix functions run test:integration'
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Group confirmation integration requires FIRESTORE_EMULATOR_HOST; never run against live Firestore.");
}
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-sandman-historical" });
const db = getFirestore(app);
const { skillCheckCoachCall } = require("../lib/modules/skillCheckCoachCall");

const coachUid = "GROUP_CONFIRM_COACH";
const base = "sprint3_group_";
const card = { groupId: "skillgroup", cardId: "doubleleg", blockId: "technique",
  familyId: "double_leg", discipline: "wrestling", athleteIds: ["GC_A", "GC_B", "GC_C"] };
const assessment = practiceId => ({
  action: "confirm-group-assessment", practiceId, groupId: "skillgroup", discipline: "wrestling",
  familyId: "double_leg", observations: [
    { athleteId: "GC_A", state: "APPLIED" }, { athleteId: "GC_B", state: "LEARNED" }
  ]
});
const request = data => skillCheckCoachCall.run({ auth: { uid: coachUid }, data });
const evidence = (practiceId, athleteId) =>
  db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills/wrestling__double_leg`);
const receipt = practiceId =>
  db.doc(`practiceSessions/${practiceId}/groupSkillConfirmations/skillgroup__wrestling__double_leg`);
async function seed(practiceId) {
  await db.doc(`staff/${coachUid}`).set({ role: "coach", status: "active", locationIds: ["group-test-location"] });
  const batch = db.batch();
  batch.set(db.doc(`practiceSessions/${practiceId}`), {
    practiceId, coachUid, locationId: "group-test-location", discipline: "wrestling",
    sessionMemory: { plannedCards: [card], workedCards: [card] }
  });
  batch.set(db.doc(`attendance_sessions/${practiceId}`), {
    practiceId, discipline: "wrestling", status: "finalized", finalized: true,
    presentIds: ["GC_A", "GC_B", "GC_C"]
  });
  for (const athleteId of ["GC_A", "GC_B", "GC_C"]) {
    batch.set(db.doc(`athletes/${athleteId}`), {
      locationId: "group-test-location", xp: 40, rank: "Shadow"
    });
    batch.set(db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`), {
      athleteId, practiceId, discipline: "wrestling", attendance: { status: "present" },
      workedCards: [card]
    });
  }
  await batch.commit();
}

test("real Firestore transactions: concurrent identical submissions write one receipt and preserve exclusions", async () => {
  const practiceId = base + "concurrent";
  await seed(practiceId);
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () => request(assessment(practiceId)))
  );
  assert.ok(results.every(row => row.status === "fulfilled"),
    JSON.stringify(results.filter(row => row.status === "rejected").map(row => String(row.reason))));
  assert.equal(results.filter(row => !row.value.idempotent).length, 1);
  assert.equal(results.filter(row => row.value.idempotent).length, 3);
  const [a, b, excluded, confirmed, athlete] = await Promise.all([
    evidence(practiceId, "GC_A").get(), evidence(practiceId, "GC_B").get(),
    evidence(practiceId, "GC_C").get(), receipt(practiceId).get(),
    db.doc("athletes/GC_A").get()
  ]);
  assert.equal(a.data().state, "APPLIED");
  assert.equal(b.data().state, "LEARNED");
  assert.equal(excluded.exists, false);
  assert.equal(confirmed.exists, true);
  assert.equal(athlete.data().xp, 40);
  assert.equal(athlete.data().rank, "Shadow");
  await assert.rejects(
    request({ ...assessment(practiceId), observations: [{ athleteId: "GC_A", state: "REFINED" }] }),
    error => error.code === "already-exists"
  );
  assert.equal((await evidence(practiceId, "GC_A").get()).data().state, "APPLIED");
});

test("real Firestore transactions: existing individual evidence prevents any group partial write", async () => {
  const practiceId = base + "conflict";
  await seed(practiceId);
  await evidence(practiceId, "GC_B").create({
    familyId: "double_leg", discipline: "wrestling", state: "MASTERED", coachUid: "OTHER"
  });
  await assert.rejects(
    request(assessment(practiceId)), error => error.code === "already-exists"
  );
  assert.equal((await evidence(practiceId, "GC_A").get()).exists, false);
  assert.equal((await receipt(practiceId).get()).exists, false);
  assert.equal((await evidence(practiceId, "GC_B").get()).data().state, "MASTERED");
});

test.after(async () => { await deleteApp(app); });
