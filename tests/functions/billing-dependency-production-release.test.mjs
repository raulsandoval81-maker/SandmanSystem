import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  "scripts/production/billing_dependency_hosting_release.py", "utf8"
);
const workflow = readFileSync(
  ".github/workflows/release-billing-dependency-production.yml", "utf8"
);
const dependency = readFileSync(
  "public/management/billing/paid-in-full-state.js", "utf8"
);

test("approved dependency exists", () => {
  assert.match(dependency, /export function paidInFullUiState/);
});

test("release is limited to the missing dependency", () => {
  const files = script.match(/FILES = \(([\s\S]*?)\)/)?.[1];
  assert.ok(files);
  assert.match(files, /public\/management\/billing\/paid-in-full-state.js/);
  assert.doesNotMatch(files, /index.html|billing.js/);
  assert.match(script, /if args.mode == "preflight"/);
  assert.match(script, /args.expected_release != release_name/);
  assert.match(script, /Unrelated production asset requested/);
  assert.match(script, /Live Hosting changed during deployment/);
});

test("production release remains protected", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: sandman-production-hosting/);
  assert.match(workflow, /options: \[preflight, deploy\]/);
  assert.match(workflow, /a4baf439c967c8a0c081218d1becb874bdd3a733/);
});
