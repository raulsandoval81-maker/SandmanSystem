import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/release-billing-prior-payment-production.yml","utf8");
const release = readFileSync("scripts/production/billing_prior_payment_hosting_release.py","utf8");
const page = readFileSync("public/management/billing/index.html","utf8");
const billing = readFileSync("public/management/billing/billing.js","utf8");

test("Billing form cache bust and partial annual fee field are in immutable release source",()=>{
  assert.match(page,/billing\.js\?v=20261031-prior-payment/);
  assert.match(billing,/id="priorPaymentEnrollmentAmount"/);
  assert.match(billing,/enrollmentFeeAmountCents/);
  assert.match(billing,/recordProposalPriorPayment/);
});
test("production Billing overlay is manual, guarded and exactly two files",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: sandman-production-hosting/);
  assert.match(workflow,/958a5351a2a257aa6d02db13f5132c3c66b54c4d/);
  assert.match(workflow,/options: \[preflight, deploy\]/);
  assert.match(release,/PROJECT = "sandmandashboard"/);
  assert.match(release,/SITE = "sandman-main"/);
  assert.match(release,/public\/management\/billing\/index.html/);
  assert.match(release,/public\/management\/billing\/billing.js/);
  assert.match(release,/PREFLIGHT ONLY/);
  assert.match(release,/Live Hosting changed during deployment/);
  assert.match(release,/Unrelated production asset requested/);
  assert.doesNotMatch(workflow,/firebase deploy|gcloud functions deploy|firestore:rules/);
});
