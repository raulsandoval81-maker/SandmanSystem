import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/production/billing_fee_balance_hosting_release.py", "utf8");
const workflow = readFileSync(".github/workflows/release-billing-fee-balance-production.yml", "utf8");
const billing = readFileSync("public/management/billing/billing.js", "utf8");

test("merged balance UI is present in approved source", () => {
  assert.match(billing, /function priorPaymentFeeBalance\(proposal\)/);
  assert.match(billing, /After this UNRECORDED payment:/);
  assert.match(billing, /Annual enrollment balance/);
});

test("Hosting overlay only modifies billing.js and preserves baseline", () => {
  const files = script.match(/FILES = \(([\s\S]*?)\)/)?.[1];
  assert.ok(files);
  assert.match(files, /public\/management\/billing\/billing.js/);
  assert.doesNotMatch(files, /index.html|paid-in-full-state.js/);
  assert.match(script, /if args.mode == "preflight"/);
  assert.match(script, /args.expected_release != release_name/);
  assert.match(script, /Unrelated production asset requested/);
  assert.match(script, /Live Hosting changed during deployment/);
});

test("protected workflow requires exact source and production approval", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: sandman-production-hosting/);
  assert.match(workflow, /options: \[preflight, deploy\]/);
  assert.match(workflow, /1f406a1127273f73991c28a08eddd26f9108123a/);
});
