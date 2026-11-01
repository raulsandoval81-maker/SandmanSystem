import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/production/billing_bullets_hosting_release.py", "utf8");
const workflow = readFileSync(".github/workflows/release-billing-bullets-production.yml", "utf8");
const billing = readFileSync("public/management/billing/billing.js", "utf8");
const style = readFileSync("public/management/billing/billing.css", "utf8");

test("approved files contain the bulleted fee summary", () => {
  assert.match(billing, /Annual Enrollment Fee Summary/);
  assert.match(billing, /billing-fee-preview-list/);
  assert.match(billing, /After this UNRECORDED payment: preview only/);
  assert.match(style, /\.billing-fee-preview-list/);
  assert.match(style, /\.billing-fee-preview-total/);
});

test("production release overlays only Billing JS and CSS", () => {
  const files = script.match(/FILES = \(([\s\S]*?)\)/)?.[1];
  assert.ok(files);
  assert.match(files, /public\/management\/billing\/billing\.js/);
  assert.match(files, /public\/management\/billing\/billing\.css/);
  assert.doesNotMatch(files, /index\.html|paid-in-full-state\.js/);
  assert.match(script, /if args.mode == "preflight"/);
  assert.match(script, /args.expected_release != release_name/);
  assert.match(script, /Unrelated production asset requested/);
  assert.match(script, /Live Hosting changed during deployment/);
});

test("protected deployment pins source and production environment", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: sandman-production-hosting/);
  assert.match(workflow, /options: \[preflight, deploy\]/);
  assert.match(workflow, /182442820a3ea854413a0d2d067d1a464bf6a4d9/);
});
