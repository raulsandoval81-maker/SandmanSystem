import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/production/billing_pr425_refresh_hosting_release.py", "utf8");
const workflow = readFileSync(".github/workflows/release-billing-pr425-refresh-production.yml", "utf8");
const billing = readFileSync("public/management/billing/billing.js", "utf8");

test("approved JS contains the successful-payment dialog refresh", () => {
  assert.match(billing, /Annual Enrollment Fee Summary/);
  assert.match(billing, /paymentRecorded = true/);
  assert.match(billing, /const refreshed = await loadBilling\(\)/);
  assert.match(billing, /refreshPriorPaymentFeePreview\(dialog\)/);
  assert.match(billing, /submit\.disabled = paymentRecorded/);
  assert.match(billing, /Do not submit again/);
});

test("production release overlays only Billing JS", () => {
  const files = script.match(/FILES = \(([\s\S]*?)\)/)?.[1];
  assert.ok(files);
  assert.match(files, /public\/management\/billing\/billing\.js/);
  assert.doesNotMatch(files, /billing\.css/);
  assert.doesNotMatch(files, /index\.html|paid-in-full-state\.js/);
  assert.match(script, /if args.mode == "preflight"/);
  assert.match(script, /args.expected_release != release_name/);
  assert.match(script, /Unrelated production asset requested/);
  assert.match(script, /Live Hosting changed during deployment/);
});

test("protected deployment pins PR425 merge source and production environment", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: sandman-production-hosting/);
  assert.match(workflow, /options: \[preflight, deploy\]/);
  assert.match(workflow, /9b3583275f8cc7d0a8dc4471e263f8a3b7bda119/);
});

test("release workflow and script cannot deploy unrelated files", () => {
  assert.match(workflow, /billing_pr425_refresh_hosting_release\.py/);
  assert.match(workflow, /test "\$\{SOURCE_SHA\}" = "9b3583275f8cc7d0a8dc4471e263f8a3b7bda119"/);
  assert.match(workflow, /ref: 9b3583275f8cc7d0a8dc4471e263f8a3b7bda119/);
  assert.match(script, /SITE = "sandman-main"/);
  assert.match(script, /PROJECT = "sandmandashboard"/);
  assert.match(script, /credential_project != PROJECT/);
  assert.match(script, /set\(changed\)\.issubset/);
  assert.match(script, /len\(live\) != int\(version\["fileCount"\]\)/);
  assert.match(script, /latest\["name"\] != release_name/);
  assert.doesNotMatch(script, /"public\/management\/billing\/billing\.css"/);
});
