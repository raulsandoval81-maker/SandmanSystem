const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw Error("Emulator only");
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, "staging-seed-safety-" + process.pid);
const db = getFirestore(app);

test("transaction refuses a concurrent nested nonsynthetic collision without partial manifest writes", async () => {
  const { commitSyntheticManifestTransaction } = await import("../scripts/staging-seed-safety.mjs");
  const prefix = "stagingSeedConcurrency/phase6";
  const safePath = `${prefix}/athletes/safe`;
  const nestedPath = `${prefix}/practices/practice/athletes/athlete/verifiedSkills/wrestling__double_leg`;
  const writes = new Map([
    [safePath, { synthetic: true, value: "safe" }],
    [nestedPath, { synthetic: true, value: "manifest" }],
  ]);
  let releaseSeed;
  let seedStarted;
  const seedIsWaiting = new Promise(resolve => { seedStarted = resolve; });
  const waitForConflict = new Promise(resolve => { releaseSeed = resolve; });
  const seed = commitSyntheticManifestTransaction(db, writes, {
    beforeRead: async () => {
      seedStarted();
      await waitForConflict;
    },
  });
  await seedIsWaiting;
  await db.doc(nestedPath).set({ synthetic: false, value: "concurrent-owner" });
  releaseSeed();
  await assert.rejects(seed, /Refusing to overwrite non-synthetic Firestore record/);
  assert.equal((await db.doc(safePath).get()).exists, false);
  const collision = await db.doc(nestedPath).get();
  assert.equal(collision.data().synthetic, false);
  assert.equal(collision.data().value, "concurrent-owner");
});

test("transactional synthetic manifest is repeatable only over synthetic records", async () => {
  const { commitSyntheticManifestTransaction } = await import("../scripts/staging-seed-safety.mjs");
  const path = "stagingSeedConcurrency/idempotent/athletes/synthetic";
  const writes = new Map([[path, { synthetic: true, value: "deterministic" }]]);
  assert.equal(await commitSyntheticManifestTransaction(db, writes), 1);
  assert.equal(await commitSyntheticManifestTransaction(db, writes), 1);
  assert.deepEqual((await db.doc(path).get()).data(), { synthetic: true, value: "deterministic" });
});
