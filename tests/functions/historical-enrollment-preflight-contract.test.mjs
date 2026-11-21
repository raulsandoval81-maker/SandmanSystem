import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const preflight = read("scripts/staging/historical-enrollment-preflight.py");
const workflow = read(".github/workflows/staging-exact-sha-release.yml");
const actionStart = workflow.indexOf("  historical-enrollment-preflight:\n");
const actionEnd = workflow.indexOf("\n  handoff-preflight:\n", actionStart);
const action = workflow.slice(actionStart, actionEnd);

test("historical enrollment read-only staging gate is pinned to approved #748 merge", () => {
  assert.match(preflight, /SHA = "3b89bffed91d6e1698503b813f14340c2440f240"/);
  assert.match(action, /ref: 3b89bffed91d6e1698503b813f14340c2440f240/);
  assert.match(action, /environment: staging/);
  assert.match(action, /Verify staging approval protections/);
  assert.match(action, /can_admins_bypass == false/);
  assert.match(preflight, /"GITHUB_RUN_ATTEMPT": "1"/);
  assert.match(preflight, /"deploymentAuthorized": False/);
  assert.doesNotMatch(action, /gcloud functions deploy|firebase deploy|gcloud run deploy/);
});

test("payment Function and Billing UI included together, no unrelated overlays", () => {
  for (const fragment of [
    '"createProposalDraft": (2, "proposals/createProposalDraft")',
    '"sendEnrollmentIntakeEmail": (1, "enrollment/sendEnrollmentIntakeEmail")',
    '"recordProposalPrepaidCash": (2, "billing/recordProposalPrepaidCash")',
    '"/management/pricing/index.html"',
    '"/management/pricing/pricing.js"',
    '"/management/billing/billing.js"',
    'prepaidPaymentEvidenceClaims',
    'paymentEvidenceReference',
  ]) assert.ok(preflight.includes(fragment), `Missing critical release surface: ${fragment}`);
  assert.match(preflight, /setdefault\(name, \{\}\)\["candidateClosureSha256"\]/);
  assert.match(action, /prepaid-evidence-claim-contract\.test\.mjs/);
  assert.match(action, /prepaidEnrollment\.integration\.cjs/);
  const emulator = action.indexOf("Isolated concurrency and prepaid enrollment gate");
  const cloudAuth = action.indexOf("google-github-actions/auth@v3");
  assert.ok(emulator > 0 && cloudAuth > emulator,
    "Payment concurrency tests must run before cloud access");
});
