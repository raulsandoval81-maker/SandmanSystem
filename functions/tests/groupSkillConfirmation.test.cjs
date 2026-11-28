const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const firestore = require("firebase-admin/firestore");

let db;
const load = Module._load;
try {
  Module._load = function (name, ...args) {
    return name === "firebase-admin/firestore"
      ? { ...firestore, getFirestore: () => db }
      : load.call(this, name, ...args);
  };
  var { skillCheckCoachCall } = require("../lib/modules/skillCheckCoachCall");
} finally {
  Module._load = load;
}

const practice = "practiceSessions/p";
const attendance = "attendance_sessions/p";
const evidence = id => `${practice}/athletes/${id}/verifiedSkills/wrestling__double_leg`;
const card = { groupId: "g", cardId: "card", blockId: "skills", familyId: "double_leg",
  discipline: "wrestling", athleteIds: ["A", "B", "C"] };
const input = {
  action: "confirm-group-assessment", practiceId: "p", groupId: "g",
  familyId: "double_leg", discipline: "wrestling",
  observations: [{ athleteId: "A", state: "MASTERED" }, { athleteId: "B", state: "LEARNED" }],
};

function fixture() {
  const rows = new Map([
    ["staff/coach", { role: "coach", status: "active", locationIds: ["north"] }],
    [practice, { discipline: "wrestling", coachUid: "coach", locationId: "north",
      sessionMemory: { plannedCards: [card], workedCards: [card] } }],
    [attendance, { practiceId: "p", discipline: "wrestling", status: "finalized",
      finalized: true, presentIds: ["A", "B", "C"] }],
  ]);
  for (const id of ["A", "B", "C"]) {
    rows.set(`athletes/${id}`, { locationId: "north", xp: 50, rank: "Shadow" });
    rows.set(`${practice}/athletes/${id}`, { practiceId: "p", athleteId: id,
      discipline: "wrestling", attendance: { status: "present" }, workedCards: [card] });
  }
  const snapshot = path => ({ exists: rows.has(path), data: () => rows.get(path) });
  const ref = path => ({ id: path.split("/").at(-1), path, get: async () => snapshot(path),
    collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  // Buffer writes until successful commit. Serialize fixture transactions to model
  // Firestore's serializable result without claiming emulator coverage.
  let pending = Promise.resolve();
  db = { doc: ref, failCommit: false, runTransaction(callback) {
    const result = pending.then(async () => {
      const writes = [];
      const read = async ({ path }) => {
        assert.equal(writes.length, 0, "Firestore requires reads before writes");
        return snapshot(path);
      };
      const value = await callback({ get: read,
        create: ({ path }, row) => { assert.equal(rows.has(path), false); writes.push([path, row]); },
        set: ({ path }, row) => { writes.push([path, row]); },
      });
      if (db.failCommit) throw new Error("Injected commit failure");
      for (const [path, row] of writes) rows.set(path, row);
      return value;
    });
    pending = result.catch(() => {});
    return result;
  } };
  return rows;
}
const call = (overrides = {}, uid = "coach") =>
  skillCheckCoachCall.run({ auth: { uid }, data: { ...input, ...overrides } });

test("group confirmation records individual stages, skips exclusions, and isolates XP and rank", async () => {
  const rows = fixture();
  assert.deepEqual(await call(), { ok: true, count: 2, idempotent: false });
  assert.equal(rows.get(evidence("A")).state, "MASTERED");
  assert.equal(rows.get(evidence("B")).state, "LEARNED");
  assert.equal(rows.get(evidence("A")).coachUid, "coach");
  assert.equal(rows.has(evidence("C")), false);
  assert.deepEqual(rows.get("athletes/A"), { locationId: "north", xp: 50, rank: "Shadow" });
  assert.equal(rows.has("athletes/A/skills/wrestling__double_leg"), false);
});

test("rejects unauthorized staff, invalid families, unfinalized attendance and forged membership", async () => {
  const rows = fixture();
  await assert.rejects(call({}, "outsider"), { code: "permission-denied" });
  await assert.rejects(call({ familyId: "unknown" }), { code: "invalid-argument" });
  await assert.rejects(call({ observations: [{ athleteId: "D", state: "APPLIED" }] }),
    { code: "failed-precondition" });
  const finalized = rows.get(attendance);
  rows.delete(attendance);
  await assert.rejects(call(), { code: "failed-precondition" });
  rows.set(attendance, { ...finalized, finalized: false });
  await assert.rejects(call(), { code: "failed-precondition" });
  rows.set(attendance, finalized);
  rows.delete(`${practice}/athletes/B`);
  await assert.rejects(call(), { code: "failed-precondition" });
  assert.equal(rows.has(evidence("A")), false);
});

test("concurrent repeats are idempotent and changed repeats cannot overwrite evidence", async () => {
  const rows = fixture();
  const results = await Promise.all([call(), call()]);
  assert.deepEqual(results.map(row => row.idempotent), [false, true]);
  await assert.rejects(call({ observations: [{ athleteId: "A", state: "REFINED" }] }),
    { code: "already-exists" });
  assert.equal(rows.get(evidence("A")).state, "MASTERED");
});

test("preserves individual history and leaves no partial writes after failed commit", async () => {
  const rows = fixture();
  const original = { state: "APPLIED", coachUid: "other-coach" };
  rows.set(evidence("B"), original);
  await assert.rejects(call(), { code: "already-exists" });
  assert.equal(rows.has(evidence("A")), false);
  assert.deepEqual(rows.get(evidence("B")), original);
  rows.delete(evidence("B"));
  const count = rows.size;
  db.failCommit = true;
  await assert.rejects(call(), /Injected commit failure/);
  assert.equal(rows.size, count);
});
