const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  isOperationalPaidProposal,
  isStagingEnrollmentRuntime,
  enrollmentIntakeBaseUrl,
  resolveEnrollmentIntakeBaseUrl
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

test("Gen1 FIREBASE_CONFIG supplies verified staging identity without GCLOUD_PROJECT", () => {
  const gen1 = {
    SANDMAN_STAGING_ACK: "sandman-combat-staging",
    SANDMAN_STAGING_PROJECT_ID: "sandman-combat-staging",
    FIREBASE_CONFIG: JSON.stringify({ projectId: "sandman-combat-staging", storageBucket: "test" })
  };
  assert.equal(isStagingEnrollmentRuntime(gen1), true);
  assert.equal(enrollmentIntakeBaseUrl(gen1), "https://sandman-combat-staging.web.app");
  for (const invalid of [
    { ...gen1, FIREBASE_CONFIG: '{"projectId":"sandmandashboard"}' },
    { ...gen1, FIREBASE_CONFIG: "{}" },
    { ...gen1, FIREBASE_CONFIG: "not-json" },
    { ...gen1, GCLOUD_PROJECT: "sandmandashboard" },
    { ...gen1, SANDMAN_STAGING_ACK: "" },
    { ...gen1, SANDMAN_STAGING_PROJECT_ID: "" },
  ]) {
    assert.equal(isStagingEnrollmentRuntime(invalid), false);
    assert.throws(() => enrollmentIntakeBaseUrl(invalid), /verified staging runtime/);
  }
});

test("source-only Gen1 runtime needs independent project identity before issuing a staging URL", async () => {
  const { GCLOUD_PROJECT: project, ...markers } = staging;
  assert.throws(() => enrollmentIntakeBaseUrl(markers), /verified staging runtime/);
  const metadata = async (url, options) => {
    assert.equal(url, "http://metadata.google.internal/computeMetadata/v1/project/project-id");
    assert.equal(options.headers["Metadata-Flavor"], "Google");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return new Response(project, {headers: {"Metadata-Flavor": "Google"}});
  };
  assert.equal(await resolveEnrollmentIntakeBaseUrl(markers, metadata), "https://sandman-combat-staging.web.app");

  for (const response of [
    new Response("sandmandashboard", {headers: {"Metadata-Flavor": "Google"}}),
    new Response(project),
    new Response(project, {status: 503, headers: {"Metadata-Flavor": "Google"}}),
  ]) {
    await assert.rejects(resolveEnrollmentIntakeBaseUrl(markers, async () => response), /verified staging runtime/);
  }
  await assert.rejects(resolveEnrollmentIntakeBaseUrl(markers, async () => {
    throw new Error("metadata unavailable");
  }), /verified staging runtime/);
});

test("project metadata cannot override declared conflicts or replace a missing staging marker", async () => {
  let reads = 0;
  const metadata = async () => { reads++; };
  const { GCLOUD_PROJECT, ...markers } = staging;
  for (const conflict of [
    { ...markers, GCLOUD_PROJECT: "sandmandashboard" },
    { ...markers, GCP_PROJECT: "sandmandashboard" },
    { ...markers, GOOGLE_CLOUD_PROJECT: "sandmandashboard" },
    { ...staging, FIREBASE_CONFIG: '{"projectId":"sandmandashboard"}' },
    { ...markers, SANDMAN_STAGING_ACK: undefined },
    { ...markers, SANDMAN_STAGING_PROJECT_ID: undefined },
  ]) {
    await assert.rejects(resolveEnrollmentIntakeBaseUrl(conflict, metadata), /verified staging runtime/);
  }
  assert.equal(await resolveEnrollmentIntakeBaseUrl(production, metadata), "https://sandmancombat.com");
  assert.equal(reads, 0);
});
