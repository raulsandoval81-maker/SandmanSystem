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
});

test("renewal autopay has a separate approval and paid-through guard", () => {
  const approval = read("functions/src/billing/approveProposalRenewalAutopay.ts");
  const autopay = read("functions/src/billing/proposalAutopaySetup.ts");
  assert.match(approval, /RENEWAL_AUTOPAY_APPROVED/);
  assert.match(approval, /membershipPaidInFull !== true/);
  assert.match(autopay, /millis <= paidThroughMillis/);
  assert.match(autopay, /Stripe billing must begin after/);
});

test("intake and activation accept only reconciled new prepaid records while retaining legacy records", () => {
  for (const path of [
    "functions/src/enrollment/sendEnrollmentIntakeEmail.ts",
    "functions/src/enrollment/recordManualEnrollmentIntakeDelivery.ts",
    "functions/src/enrollment/enrollmentActivity.ts",
    "public/intake-management/management.intake.js",
  ]) {
    const source = read(path);
    assert.match(source, /membershipPaidInFull === true/);
    assert.match(source, /typeof proposal\.cashPrepayment\?\.membershipPaidInFull !== "boolean"/);
  }
});
