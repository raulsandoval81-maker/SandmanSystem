#!/usr/bin/env node
/**
 * PR #427 immutable-source release preflight, deliberately read-only.
 * Does NOT inspect live GCP state, authorize deployment, or write payment records.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

export const APPROVED_SOURCE = "f3650ca4007448086d5a674df5784bbb3cdb9f54";
export const FUNCTION = "correctP000019HistoricalAllocation";
export const HOSTING_FILES = Object.freeze([
  "public/management/billing/billing.js",
  "public/connect/proposals/proposals.js",
  "public/management/enrollment-flow/enrollment-flow.js",
  "public/management/shared/services/historical-payment-summary.js",
]);

const read = (root, file) => readFileSync(join(root, file), "utf8");

export function inspectSource(root, sha) {
  assert.equal(sha, APPROVED_SOURCE, "Source SHA must equal merged PR #427");
  const callable = read(root, "functions/src/billing/correctP000019HistoricalAllocation.ts");
  const logic = read(root, "functions/src/billing/correctP000019Payments.ts");
  const index = read(root, "functions/src/index.ts");
  const ledger = read(root, "functions/src/billing/historicalCashReconciliation.ts");
  const firebase = JSON.parse(read(root, "firebase.json"));
  assert.match(index, /export\s*\{\s*correctP000019HistoricalAllocation\s*,?\s*\}\s*from\s*["\']\.\/billing\/correctP000019HistoricalAllocation["\']/);
  assert.match(callable, /requireProposalStaffAccess/);
  assert.match(callable, /requireProposalLocationAccess/);
  assert.match(callable, /runTransaction/);
  assert.match(callable, /HISTORICAL_PAYMENT_ALLOCATION_CORRECTED/);
  assert.match(callable, /priorPaymentsBefore:/);
  assert.match(callable, /priorPaymentsAfter:/);
  assert.match(callable, /historicalPaymentCorrection/);
  assert.match(logic, /proposalId\s*!==\s*["']P-000019["']/);
  assert.match(logic, /payments\.length\s*!==\s*2/);
  assert.match(logic, /"2026-09":\s*\{\s*membership:\s*10000,\s*enrollment:\s*0,\s*rate:\s*10000\s*\}/);
  assert.match(logic, /"2026-10":\s*\{\s*membership:\s*8000,\s*enrollment:\s*2000,\s*rate:\s*8000\s*\}/);
  assert.match(ledger, /historicalMonthlyRateCents/);
  assert.equal(firebase.functions.runtime, "nodejs22");
  assert.equal(firebase.functions.source, "functions");
  assert.equal(firebase.hosting.public, "public");
  const files = HOSTING_FILES.map(file => {
    const contents = read(root, file);
    assert.ok(contents.length > 400, "Unexpectedly short Hosting asset: " + file);
    return { file, bytes: Buffer.byteLength(contents) };
  });
  for(const file of HOSTING_FILES.slice(0,3)) {
    assert.match(read(root,file), /historicalPaymentSummary/, file + " must use shared ledger");
  }
  const checkoutTerms = read(root, "functions/src/billing/historicalCashCheckoutTerms.ts");
  assert.match(checkoutTerms, /Membership start must match the first fully paid historical month/);
  assert.match(checkoutTerms, /First recurring charge must be on the fifth/);
  return {
    sourceSha: sha,
    targetFunction: FUNCTION,
    targetHostingFiles: files,
    productionProject: "sandmandashboard",
    stagingProject: "sandman-combat-staging",
    currentState: "SOURCE_ONLY_PREFLIGHT",
    deploymentAuthorized: false,
    functionsDeployed: false,
    hostingDeployed: false,
    productionLedgerChanged: false,
    blockedUntil: [
      "Confirm protected staging IAM, runtime identity, invoker policy and current function baseline using real cloud read access",
      "Approve and validate narrow staging deployment of only the new callable; verify deployed identity and audit behavior",
      "Confirm production IAM and deployment method without changing any roles; validate deployer supports new callable",
      "Independently verify production Hosting baseline, exact four-file overlay, and release authorization",
      "Resolve October membershipStartDate versus September paid period and confirm firstRecurringChargeDate before checkout",
      "Confirm the real P-000019 record meets correction preconditions immediately before any separately authorized transaction",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const root = resolve(process.argv[2] || ".");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const report = inspectSource(root, sha);
  const path = process.argv[3];
  if (path) {
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
