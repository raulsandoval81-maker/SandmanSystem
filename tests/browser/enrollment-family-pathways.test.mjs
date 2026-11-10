import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync("public/connect/enrollment/index.html", "utf8");
const source = readFileSync("public/connect/enrollment/enrollment.js", "utf8");
const css = readFileSync("public/connect/enrollment/enrollment.css", "utf8");

function simulate(enrollment) {
  const progress = ["summary", "payment", "intake", "approval", "onboarding"].map((step) => ({
    dataset: { step }, setAttribute(key, value) { this[key] = value; },
    removeAttribute(key) { delete this[key]; },
  }));
  const button = { textContent: "" };
  const elements = {
    paymentStepLabel: { textContent: "" },
    paymentStepOwner: { textContent: "" },
    intro: { textContent: "" },
  };
  const section = source.slice(source.indexOf("  function enrollmentPathway("), source.indexOf("  function restoreCorrectStep("));
  const context = {
    state: { enrollment }, elements,
    document: { querySelectorAll() { return progress; }, getElementById() { return button; } },
  };
  runInNewContext(section + "\nrenderEnrollmentProgress();", context);
  return {
    stages: progress.map((item) => [item.dataset.step, item.dataset.status]),
    current: progress.find((item) => item["aria-current"] === "step")?.dataset.step,
    button: button.textContent,
    payment: elements.paymentStepLabel.textContent,
    owner: elements.paymentStepOwner.textContent,
    intro: elements.intro.textContent,
  };
}

test("family page has all five compact stages and existing buttons", () => {
  for (const step of ["Review &amp; Confirm", "Payment / Verification", "Intake &amp; Waiver",
    "Management Approval &amp; Athlete Creation", "Account Setup &amp; Onboarding"]) {
    assert.ok(html.includes(step), step);
  }
  assert.match(css, /data-status="complete"/);
  assert.match(html, /id="saveAgreementButton"/);
});

test("unsigned Cash/Check shows Intake next and avoids Stripe language", () => {
  const result = simulate({ paymentRoute: "management_prepaid_reconciliation", pricing: {
    paymentArrangement: "prepaid_cash_check" }, confirmation: { termsConfirmed: false } });
  assert.equal(result.current, "summary");
  assert.equal(result.payment, "Cash/Check Verification");
  assert.equal(result.owner, "Management");
  assert.equal(result.button, "Confirm & Continue to Intake");
  assert.doesNotMatch(result.intro, /Stripe/);
});

test("confirmed Cash/Check does not claim payment verified or Intake completed", () => {
  const result = simulate({ paymentRoute: "management_prepaid_reconciliation", pricing: {
    paymentArrangement: "prepaid_cash_check" }, confirmation: { termsConfirmed: true } });
  assert.equal(result.current, "intake");
  assert.equal(result.stages.find(([key]) => key === "payment")[1], "pending");
});

test("Stripe monthly and one-time present distinct payment labels", () => {
  const base = { paymentRoute: "stripe_checkout", confirmation: { termsConfirmed: false } };
  assert.equal(simulate({ ...base, pricing: { paymentArrangement: "monthly_autopay" } }).button,
    "Confirm & Continue to Secure Payment");
  assert.equal(simulate({ ...base, pricing: { paymentArrangement: "prepaid_stripe" } }).button,
    "Confirm & Continue to One-Time Payment");
});

test("paid family with completed Intake moves to Management stage", () => {
  const result = simulate({ paymentRoute: "stripe_checkout", paymentStatus: "PAID",
    intakeComplete: true, confirmation: { termsConfirmed: true }, pricing: {} });
  assert.equal(result.current, "approval");
  assert.equal(result.stages.find(([key]) => key === "payment")[1], "complete");
  assert.equal(result.stages.find(([key]) => key === "intake")[1], "complete");
});

test("family page never creates a payment authorization from progress state", () => {
  const section = source.slice(source.indexOf("  function enrollmentPathway("), source.indexOf("  function restoreCorrectStep("));
  assert.doesNotMatch(section, /createCheckout|httpsCallable|issueEarlyCashCheckIntake|stripe\.checkout/);
});
