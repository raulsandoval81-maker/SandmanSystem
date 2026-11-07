// Offline review-only guard for the Emmett 2C staging release plan.
// No cloud credentials, provider calls, payment operations or deployments.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "scripts/staging/emmett-2c-readonly-preflight-plan.json"), "utf8"));
const functions = ["recordProposalPrepaidCash", "sendProposalPrepaidCashReceipt", "sendEnrollmentIntakeEmail", "issueProposalEnrollmentHandoff", "approveAndActivate"];
const hosting = [
  "public/connect/admissions/calculator/calculator.js",
  "public/connect/admissions/calculator/index.html",
  "public/connect/proposals/proposals.js",
  "public/intake-management/management.intake.js",
  "public/management/billing/billing.js",
  "public/management/enrollment-flow/enrollment-flow.js",
  "public/management/enrollment-flow/enrollment-stage.js",
];
test("2C release plan remains validation-only and pinned to approved merged source", () => {
  assert.equal(manifest.repository, "raulsandoval81-maker/SandmanSystem");
  assert.equal(manifest.applicationSha, "b4b40798b58aac46706dce984427e77d501855e7");
  assert.equal(manifest.targetProject, "sandman-combat-staging");
  assert.equal(manifest.mode, "validation-only");
  assert.equal(manifest.deploymentAuthorized, false);
  assert.equal(manifest.productionAuthorized, false);
  assert.equal(manifest.syntheticDataOnly, true);
  assert.deepEqual(manifest.functionsToInventory, functions);
  assert.deepEqual(manifest.hostingFilesToInventory, hosting);
});
test("2C reviewed assets and tests exist, including existing-athlete guard", () => {
  for (const path of [...hosting, ...manifest.tests]) assert.ok(existsSync(resolve(root, path)), path);
  const activation = readFileSync(resolve(root, "functions/src/approveAndActivate.ts"), "utf8");
  assert.match(activation, /Existing athlete cannot use new-athlete activation/);
  const payment = readFileSync(resolve(root, "functions/src/billing/recordProposalPrepaidCash.ts"), "utf8");
  assert.match(payment, /verifyPrepaidConversionSource/);
  const receipt = readFileSync(resolve(root, "functions/src/billing/sendProposalPrepaidCashReceipt.ts"), "utf8");
  assert.match(receipt, /sendProposalPrepaidCashReceipt/);
});
test("2C release plan must record unresolved live preflight blockers", () => {
  assert.ok(manifest.knownBlockers.length >= 3);
  assert.ok(manifest.gates.some(g => g.includes("rollback")));
  assert.ok(manifest.gates.some(g => g.includes("IAM")));
});
