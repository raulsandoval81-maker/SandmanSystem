const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Separate processes reproduce the isolated staging entrypoint: importing
// lib/index.js here would hide the missing initialization in the callable.
for (const mode of ["cold", "existing-default", "named-only", "unauthenticated"]) {
  test(`isolated prior-payment startup: ${mode}`, () => {
    const result = spawnSync(process.execPath, ["-e", `
      const assert = require("node:assert/strict");
      const Module = require("node:module");
      const admin = require("firebase-admin/app");
      const firestore = require("firebase-admin/firestore");
      const mode = ${JSON.stringify(mode)};
      let existing;
      if (mode === "existing-default") existing = admin.initializeApp({ projectId: "demo-prior-payment-startup" });
      if (mode === "named-only") admin.initializeApp({ projectId: "demo-prior-payment-startup" }, "other");
      let staffReads = 0;
      const originalLoad = Module._load;
      Module._load = function(id, ...args) {
        if (id === "firebase-admin/firestore") return {
          ...firestore,
          getFirestore() {
            // Real SDK reproduces app/no-app before the repair. No network:
            // all document reads below are denied by an in-memory staff stub.
            firestore.getFirestore();
            return { collection(name) {
              assert.equal(name, "staff");
              return { doc(uid) {
                assert.equal(uid, "synthetic-staff");
                return { async get() { staffReads++; return { exists: false }; } };
              } };
            } };
          },
        };
        return originalLoad.call(this, id, ...args);
      };
      const entry = {
        recordProposalPriorPayment: require("./lib/billing/recordProposalPriorPayment.js").recordProposalPriorPayment,
      };
      assert.ok(entry.recordProposalPriorPayment.__endpoint.callableTrigger);
      (async () => {
        const request = {
          auth: mode === "unauthenticated" ? undefined : { uid: "synthetic-staff" },
          data: { proposalId: "P-000006", amountCents: 11000, paymentMethod: "Check", periods: ["2026-10"], enrollmentFeeAmountCents: 3000 },
        };
        for (let attempt = 0; attempt < 2; attempt++) {
          await assert.rejects(entry.recordProposalPriorPayment.run(request),
            error => error.code === (mode === "unauthenticated" ? "unauthenticated" : "permission-denied"));
        }
        assert.equal(staffReads, mode === "unauthenticated" ? 0 : 2);
        if (mode === "unauthenticated") assert.equal(admin.getApps().length, 0);
        else {
          assert.equal(admin.getApps().filter(app => app.name === "[DEFAULT]").length, 1);
          if (existing) assert.equal(admin.getApp(), existing);
          if (mode === "named-only") assert.equal(admin.getApps().length, 2);
        }
        await Promise.all(admin.getApps().map(app => admin.deleteApp(app)));
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, GCLOUD_PROJECT: "demo-prior-payment-startup", FIREBASE_CONFIG: '{"projectId":"demo-prior-payment-startup"}' },
    });
    assert.equal(result.status, 0, result.stderr || String(result.error || result.stdout));
  });
}
