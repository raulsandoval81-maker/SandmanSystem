const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  isOperationalPaidProposal,
  isStagingEnrollmentRuntime,
  enrollmentIntakeBaseUrl
} = require("../lib/enrollment/operationalPaidProposal");

const staging = {
  GCLOUD_PROJECT: "sandman-combat-staging",
  SANDMAN_STAGING_ACK: "sandman-combat-staging",
  SANDMAN_STAGING_PROJECT_ID: "sandman-combat-staging"
};
const production = { GCLOUD_PROJECT: "sandmandashboard" };
const base = { status: "PAID", paymentStatus: "paid", paidAt: "timestamp" };

test("verified staging runtime requires the actual project and both markers", () => {
  assert.equal(isStagingEnrollmentRuntime(staging), true);
  assert.equal(isStagingEnrollmentRuntime({ ...staging, GCLOUD_PROJECT: "sandmandashboard" }), false);
  assert.equal(isStagingEnrollmentRuntime({ ...staging, SANDMAN_STAGING_ACK: "" }), false);
  assert.equal(isStagingEnrollmentRuntime({ ...staging, SANDMAN_STAGING_PROJECT_ID: "" }), false);
});

test("test checkout is eligible in staging only with explicit test evidence and paid state", () => {
  const paid = { ...base, stripeLivemode: false, stripeCheckoutSessionId: "cs_test_abcdef" };
  assert.equal(isOperationalPaidProposal(paid, staging), true);
  assert.equal(isOperationalPaidProposal(paid, production), false);
  assert.equal(isOperationalPaidProposal(paid, { ...staging, SANDMAN_STAGING_ACK: "" }), false);
  assert.equal(isOperationalPaidProposal({ ...paid, stripeLivemode: true }, staging), false);
  assert.equal(isOperationalPaidProposal({ ...paid, status: "READY_FOR_CHECKOUT" }, staging), false);
  assert.equal(isOperationalPaidProposal({ ...paid, paymentStatus: "unpaid" }, staging), false);
  assert.equal(isOperationalPaidProposal({ ...paid, paidAt: null }, staging), false);
});

test("live Stripe and recorded prepaid cash still follow existing paid rules", () => {
  assert.equal(isOperationalPaidProposal({
    ...base, stripeCheckoutSessionId: "cs_live_abc", stripeLivemode: true
  }, production), true);
  assert.equal(isOperationalPaidProposal({
    ...base, paymentMethod: "cash_prepaid",
    cashPrepayment: { amountCents: 120000, membershipPaidInFull: true }
  }, production), true);
  assert.equal(isOperationalPaidProposal({
    ...base, paymentMethod: "cash_prepaid",
    cashPrepayment: { amountCents: 0, membershipPaidInFull: true }
  }, staging), false);
});

test("staging intake links never point at production and fail closed on invalid marker", () => {
  assert.equal(enrollmentIntakeBaseUrl(staging), "https://sandman-combat-staging.web.app");
  assert.equal(enrollmentIntakeBaseUrl(production), "https://sandmancombat.com");
  assert.throws(() => enrollmentIntakeBaseUrl({
    ...staging, SANDMAN_STAGING_ACK: ""
  }), /verified staging runtime/);
});

test("intake prefill uses the shared paid-proposal policy", () => {
  const hydrateSource = fs.readFileSync(
    path.join(__dirname, "../src/enrollment/hydrateEnrollmentIntakePrefill.ts"),
    "utf8"
  );
  assert.match(hydrateSource, /import \{ isOperationalPaidProposal \} from "\.\/operationalPaidProposal"/);
  assert.doesNotMatch(hydrateSource, /function isOperationalPaidProposal/);
  assert.doesNotMatch(hydrateSource, /!checkoutSessionId\.startsWith\("cs_test_"\)/);
});
