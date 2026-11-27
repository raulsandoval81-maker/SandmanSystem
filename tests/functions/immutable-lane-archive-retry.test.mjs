import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helperSource = readFileSync("public/assets/js/immutable-lane-archive.js", "utf8");
const { archiveMatchesSubmission, assertCompatibleLaneArchive, ensureImmutableLaneArchive } =
  await import("data:text/javascript;base64," + Buffer.from(helperSource).toString("base64"));

const original = (lane = "honor", award = 5) => ({
  athleteId: "F4_MixedCase", sourceAthleteId: "F4_MixedCase", sourceKey: "segment1_1",
  sourceCollection: "laneSubmissions", historyType: "submission", status: "closed",
  lane: lane === "honor" ? "honor" : "strength",
  ...(lane === "conditioning" ? { assignmentLane: "conditioning" } : {}),
  awardedXp: award, coachNote: "original permanent note",
});
const docs = (data) => ({
  docs: data ? [{ id: "F4_MixedCase__segment1_1", data: () => data }] : [],
});
const args = ({ previous = null, setDoc = async () => {}, lane = "honor", award = 5 } = {}) => ({
  historyRef: { id: "F4_MixedCase__segment1_1" },
  archive: original(lane, award),
  athleteId: "F4_MixedCase", key: "segment1_1", lane,
  readHistoryForAthlete: async id => {
    assert.equal(id, "F4_MixedCase");
    return docs(previous);
  },
  setDoc,
});

test("first scoped Coach archive creates one immutable record without merge", async () => {
  let writes = 0;
  const r = await ensureImmutableLaneArchive(args({
    setDoc: async (ref, data, options) => {
      assert.equal(ref.id, "F4_MixedCase__segment1_1");
      assert.equal(data.sourceKey, "segment1_1");
      assert.equal(options, undefined);
      writes++;
    },
  }));
  assert.equal(writes, 1);
  assert.deepEqual(r, { created: true, existing: false });
});

test("repeat Honor and Conditioning approval reuses matching archive without writing", async () => {
  for (const lane of ["honor", "conditioning"]) {
    let writes = 0;
    const r = await ensureImmutableLaneArchive(args({
      lane, previous: original(lane),
      setDoc: async () => writes++,
    }));
    assert.deepEqual(r, { created: false, existing: true });
    assert.equal(writes, 0);
  }
});

test("altered archive identity, source and award are rejected before any write", async () => {
  for (const prior of [
    { ...original(), athleteId: "other" },
    { ...original(), sourceKey: "different" },
    { ...original(), historyType: "unauthorized" },
    { ...original(), awardedXp: 0 },
    { ...original(), lane: "strength" },
  ]) {
    let writes = 0;
    await assert.rejects(ensureImmutableLaneArchive(args({
      previous: prior, setDoc: async () => writes++,
    })), /HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW/);
    assert.equal(writes, 0);
  }
  assert.equal(archiveMatchesSubmission(null, "F4_MixedCase", "segment1_1", "honor", 5), false);
});

test("pre-XP archive check rejects conflicting award and accepts matching existing record", async () => {
  const baseline = { ...args({ previous: original(), lane: "honor" }), expectedAward: 5 };
  assert.equal(await assertCompatibleLaneArchive(baseline), true);
  assert.equal(await assertCompatibleLaneArchive(args()), false);
  await assert.rejects(
    assertCompatibleLaneArchive(args({ previous: original("honor", 0) })),
    /HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW/,
  );
});

test("concurrent matching create is recognized without retrying denied update", async () => {
  let record = null, attempts = 0;
  const denied = new Error("PERMISSION_DENIED");
  const input = args({
    setDoc: async () => {
      attempts++;
      record = original();
      throw denied;
    },
  });
  input.readHistoryForAthlete = async () => docs(record);
  assert.deepEqual(await ensureImmutableLaneArchive(input), { created: false, existing: true });
  assert.equal(attempts, 1);
});

test("unexpected archive write permission failure is not hidden or retried", async () => {
  let attempts = 0;
  const denied = new Error("PERMISSION_DENIED");
  await assert.rejects(
    ensureImmutableLaneArchive(args({ setDoc: async () => {
      attempts++;
      throw denied;
    } })),
    error => error === denied,
  );
  assert.equal(attempts, 1);
});

test("both Coach paths preflight archive before XP and never merge an existing archive", () => {
  for (const lane of ["honor", "conditioning"]) {
    const source = readFileSync(`public/coaches/lanes/${lane}/review.js`, "utf8");
    assert.match(source, /const readHistoryForAthlete =/);
    assert.match(source, /where\("athleteId", "==", athleteId\)/);
    assert.match(source, /ensureImmutableLaneArchive\(\{/);
    assert.doesNotMatch(source, /setDoc\(historyRef, \{/);
    const preflight = source.indexOf("await assertCompatibleLaneArchive({");
    const award = source.indexOf("await awardXp({", preflight);
    assert.ok(preflight > 0 && award > preflight, `${lane} preflights before awarding XP`);
  }
});

test("authoritative XP backend uses stable lane submission receipts (source contract)", () => {
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.match(source, /lane-submission:\$\{request\.kind\.toLowerCase\(\)\}:\$\{requiredString\(request\.meta\.key/);
  assert.match(source, /if \(receiptSnap\.exists\)/);
  assert.match(source, /idempotent: true, duplicate: true/);
  assert.match(source, /tx\.create\(receiptRef/);
});
