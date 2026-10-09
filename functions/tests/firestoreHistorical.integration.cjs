// Firestore emulator integration tests. Never run against a production database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldPath, Timestamp } = require("firebase-admin/firestore");
const { reconcileHistoryPages } = require("../lib/modules/historicalSkillReconciliation");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is required; refusing production database access");
}
const projectId = process.env.GCLOUD_PROJECT || "sandman-historical-integration";
if (!projectId.startsWith("demo-")) {
  throw new Error("Use a demo- Firebase project for integration tests");
}
const app = initializeApp({ projectId }, "historical-integration-" + process.pid);
const db = getFirestore(app);
const athleteId = "F8_TEST_1";
const discipline = "wrestling";
const prefix = "historical-it-" + process.pid + "-";
const day = n => "2026-10-" + String(n).padStart(2, "0");

async function writePractice(n, scope = "location-a", overrides = {}) {
  const id = prefix + n;
  const practice = { coachUid: "coach-a", locationId: scope,
    academyId: "academy-a", discipline, sessionDateKey: day(n), ...(overrides.practice || {}) };
  await db.doc("practiceSessions/" + id).set(practice);
  const attendance = { practiceId: id, discipline, status: "finalized",
    finalized: true, presentIds: [athleteId], ...(overrides.attendance || {}) };
  if (!overrides.omitAttendance) await db.doc("attendance_sessions/" + id).set(attendance);
  if (!overrides.omitMemory) await db.doc("practiceSessions/" + id + "/athletes/" + athleteId)
    .set({ practiceId: id, athleteId, discipline, attendance: { status: "present" } });
  if (!overrides.omitEvidence) await db.doc("practiceSessions/" + id +
    "/athletes/" + athleteId + "/verifiedSkills/wrestling__double_leg").set({
      discipline, familyId: "double_leg", state: n % 2 ? "LEARNED" : "APPLIED",
      coachUid: "coach-a", verifiedAt: Timestamp.fromDate(new Date(day(n) + "T18:00:00Z"))
    });
  return id;
}

async function readVerified(id) {
  const [a, m, e] = await Promise.all([
    db.doc("attendance_sessions/" + id).get(),
    db.doc("practiceSessions/" + id + "/athletes/" + athleteId).get(),
    db.collection("practiceSessions/" + id + "/athletes/" + athleteId + "/verifiedSkills").get()
  ]);
  if (!a.exists || !m.exists || a.get("finalized") !== true ||
      a.get("status") !== "finalized" || !a.get("presentIds").includes(athleteId) ||
      m.get("attendance.status") !== "present") return { admissible: false, records: [] };
  const records = e.docs.map(d => d.data());
  return { admissible: records.length > 0 && records.every(x =>
    x.familyId && x.coachUid && x.verifiedAt instanceof Timestamp), records };
}

test("Firestore emulator: finalized attendance and verified observation", async () => {
  const id = await writePractice(1);
  const result = await readVerified(id);
  assert.equal(result.admissible, true);
  assert.equal(result.records[0].verifiedAt.toDate().toISOString(), day(1) + "T18:00:00.000Z");
});

test("Firestore emulator: absent athlete memory blocks evidence", async () => {
  const id = await writePractice(2, "location-a", { omitMemory: true });
  assert.equal((await readVerified(id)).admissible, false);
});

test("Firestore emulator: non-finalized attendance blocks evidence", async () => {
  const id = await writePractice(3, "location-a", {
    attendance: { finalized: false, status: "open" }
  });
  assert.equal((await readVerified(id)).admissible, false);
});

test("Firestore emulator: absent verified Skills blocks evidence", async () => {
  const id = await writePractice(4, "location-a", { omitEvidence: true });
  assert.equal((await readVerified(id)).admissible, false);
});

test("Firestore emulator: scoped pagination and cross-scope reconciliation", async () => {
  const a = await writePractice(5);
  const b = await writePractice(6);
  await writePractice(7, "location-b");
  const ids = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    let query = db.collection("practiceSessions")
      .where("locationId", "==", "location-a")
      .orderBy(FieldPath.documentId()).limit(1);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const id = snapshot.docs[0].id;
    if (id.startsWith(prefix)) ids.push(id);
    cursor = id;
  }
  assert.ok(ids.includes(a) && ids.includes(b));
  assert.equal(ids.includes(prefix + "7"), false);
  const batches = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const result = await readVerified(id);
    if (!result.admissible) continue;
    const doc = await db.doc("practiceSessions/" + id).get();
    batches.push({ practiceId: id, sessionDateKey: doc.get("sessionDateKey"),
      verifiedSkills: result.records.map(x => ({
        familyId: x.familyId, state: x.state, coachUid: x.coachUid,
        verifiedAt: x.verifiedAt.toDate().toISOString()
      })) });
  }
  const page = scope => ({ athleteId, discipline, scope, cursor: null, nextCursor: null,
    scopeExhausted: true, history: batches });
  const result = reconcileHistoryPages([page("coach"), page("athlete-location")],
    ["coach", "athlete-location"], athleteId, discipline);
  assert.equal(result.practices.length, batches.length);
  assert.equal(result.blockers.includes("conflicting-duplicate-practice"), false);
  assert.equal(result.eligibleForAuto, false);
});

test.after(async () => {
  await deleteApp(app);
});
