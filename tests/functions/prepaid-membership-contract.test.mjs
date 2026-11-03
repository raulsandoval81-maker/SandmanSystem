import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("prepaid recording preserves Review & Confirm and requires exact paid-in-full policy", () => {
  const callable = read("functions/src/billing/recordProposalPrepaidCash.ts");
  assert.match(callable, /currentStatus ===\s*"READY_FOR_CHECKOUT"/);
  assert.match(callable, /resolveFullYearPrepayment/);
  assert.match(callable, /RENEWAL_AUTOPAY_APPROVAL_REQUIRED/);
  assert.match(callable, /membershipPaidThroughDate/);
  assert.match(callable, /annualEnrollmentFee/);
  assert.match(callable, /ENROLLMENT_FEE_ATTRIBUTIONS_RECORDED/);
  assert.match(callable, /resolveHistoricalEnrollmentFeeAttributions/);
  assert.match(callable, /assertPrepaidFamilyConfirmation/);
  assert.match(callable, /PREPAID_RECONCILIATION_PREPARED/);
  assert.match(callable, /Original payment date cannot be in the future/);
});

test("Review & Confirm uses only the server-owned prepaid route and never opens Stripe for it", () => {
  const enrollment = read("public/connect/enrollment/enrollment.js");
  const getEnrollment = read("functions/src/proposals/getProposalEnrollment.ts");
  const saveAgreement = read("functions/src/proposals/saveProposalEnrollmentAgreement.ts");
  const checkout = read("functions/src/proposals/createProposalCheckout.ts");
  assert.match(getEnrollment, /isPreparedForPrepaidReconciliation\(proposal\)/);
  assert.match(saveAgreement, /isPreparedForPrepaidReconciliation\(proposal\)/);
  assert.match(enrollment, /management_prepaid_reconciliation/);
  assert.match(enrollment, /showPrepaidCompletion\(\);\s*return;/);
  assert.match(checkout, /isPreparedForPrepaidReconciliation\(proposal\)/);
  assert.match(checkout, /must not enter Stripe Checkout/);
  assert.doesNotMatch(enrollment, /confirmation\.paymentRoute|confirmation\.prepaid/);
});

test("renewal autopay has a separate approval and paid-through guard", () => {
  const approval = read("functions/src/billing/approveProposalRenewalAutopay.ts");
  const autopay = read("functions/src/billing/proposalAutopaySetup.ts");
  assert.match(approval, /RENEWAL_AUTOPAY_APPROVED/);
  assert.match(approval, /membershipPaidInFull !== true/);
  assert.match(autopay, /millis <= paidThroughMillis/);
  assert.match(autopay, /Stripe billing must begin after/);
});

test("intake and activation retain prepaid safeguards through the shared eligibility helper", () => {
  const policy = read("functions/src/enrollment/operationalPaidProposal.ts");
  assert.match(policy, /membershipPaidInFull === true/);
  assert.match(policy, /typeof proposal\.cashPrepayment\?\.membershipPaidInFull !== "boolean"/);
  assert.match(policy, /paymentMethod === "cash_prepaid"/);
  assert.match(policy, /Number\(proposal\.cashPrepayment\?\.amountCents \|\| 0\) > 0/);
  assert.match(policy, /status === "PAID"/);
  assert.match(policy, /paymentStatus === "paid"/);

  for (const path of [
    "functions/src/enrollment/sendEnrollmentIntakeEmail.ts",
    "functions/src/enrollment/recordManualEnrollmentIntakeDelivery.ts",
    "functions/src/enrollment/enrollmentActivity.ts",
  ]) {
    const source = read(path);
    assert.match(source, /import \{[^}]*isOperationalPaidProposal[^}]*\} from "\.\/operationalPaidProposal"/);
    assert.match(source, /isOperationalPaidProposal\(proposal\)/);
  }

  const browser = read("public/intake-management/management.intake.js");
  assert.match(browser, /\.filter\(isOperationalPaidProposal\)/);
  assert.match(browser, /function isOperationalPaidProposal\(proposal = \{\}\)/);
  assert.match(browser, /membershipPaidInFull === true/);
  assert.match(browser, /typeof proposal\.cashPrepayment\?\.membershipPaidInFull !== "boolean"/);
});
