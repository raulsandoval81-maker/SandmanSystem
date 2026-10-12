const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertFails} = require("@firebase/rules-unit-testing");
const {doc, setDoc, updateDoc, deleteDoc} = require("firebase/firestore");

test("historical baseline and certificate writes are inaccessible to all Firebase clients", async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Run inside the Firestore emulator");
  const env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT || "demo-sandman-historical",
    firestore: {rules: fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8")},
  });
  try {
    const paths = [
      "athletes/F8_RULES/historyRevisions/wrestling",
      "athletes/F8_RULES/historicalTransferReviews/wrestling",
      "athletes/F8_RULES/historicalTransferReviews/wrestling/coverageCertificates/test-manifest",
      "athletes/F8_RULES/historicalTransferReviews/wrestling/sourceVerificationReceipts/test-receipt",
    ];
    await env.withSecurityRulesDisabled(async context => {
      for (const p of paths) await setDoc(doc(context.firestore(), p), {revision: 1, baselineStatus: "PENDING"});
    });
    const principals = [
      {uid:"test-admin",claims:{role:"admin"}},
      {uid:"test-coach",claims:{role:"coach"}},
      {uid:"test-management",claims:{role:"management"}},
      {uid:"test-athlete",claims:{role:"athlete"}},
    ];
    for (const principal of principals) {
      const db = env.authenticatedContext(principal.uid, principal.claims).firestore();
      for (const p of paths) {
        await assertFails(setDoc(doc(db,p), {revision:2,baselineStatus:"VERIFIED_COMPLETE"}));
        await assertFails(updateDoc(doc(db,p), {revision:2}));
        await assertFails(deleteDoc(doc(db,p)));
      }
    }
    const anonymous = env.unauthenticatedContext().firestore();
    for (const p of paths) await assertFails(setDoc(doc(anonymous,p), {revision:2}));
  } finally {
    await env.cleanup();
  }
});
