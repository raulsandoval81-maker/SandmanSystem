import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

const management = read("public/connect/proposals/proposals.js");
const enrollment = read("public/connect/enrollment/enrollment.js");
const handoff = read("functions/src/proposals/issueProposalEnrollmentHandoff.ts");
const save = read("functions/src/proposals/saveProposalEnrollmentAgreement.ts");
const checkout = read("functions/src/proposals/createProposalCheckout.ts");
const guide = read("public/connect/proposals/index.html");
const standard = read("foundation/architecture/ENROLLMENT.md");

test("both guardian approval options use the existing secure handoff", () => {
  assert.match(management, /data-proposal-action="preview-enrollment-verification"/);
  assert.match(management, /Open In-Person Approval/);
  assert.match(management, /data-proposal-action="email-enrollment-verification"/);
  assert.match(management, /Send Approval Email/);
  assert.match(management, /const delivery\s*=\s*action === "email-enrollment-verification"\s*\? "email"\s*: "local"/);
  assert.match(management, /"issueProposalEnrollmentHandoff"/);
  assert.match(handoff, /!\["local", "email"\]\.includes\(delivery\)/);
  assert.match(handoff, /const enrollmentPath\s*=/);
  assert.match(handoff, /"ENROLLMENT_VERIFICATION_ISSUED"/);
});

test("guardian confirmation records one standard event independent of delivery", () => {
  assert.match(save, /"ENROLLMENT_TERMS_CONFIRMED"/);
  assert.match(save, /"secure_enrollment_link"/);
  assert.match(save, /termsConfirmed:\s*true/);
});

test("existing Cash\/Check never sends guardian to new Stripe checkout", () => {
  assert.match(enrollment, /Approve & Confirm Enrollment/);
  assert.match(enrollment, /"management_prepaid_reconciliation"/);
  assert.match(enrollment, /Management verifies the payment separately; no new online payment is required/);
  assert.match(enrollment, /showPrepaidCompletion\(\);\s*return;/);
  assert.match(checkout, /"prepaid_cash_check"/);
  assert.match(checkout, /must not enter Stripe Checkout/);
});

test("management guidance distinguishes paid Cash\/Check from unpaid online checkout", () => {
  assert.match(guide, /guardian reviews and confirms/);
  assert.match(guide, /In Person:/);
  assert.match(guide, /<strong>Email:/);
  assert.match(guide, /without a second charge/);
  assert.match(standard, /Guardian Approval — Standard/);
  assert.match(standard, /Cash\/Check Paid-in-Full already received/);
});
