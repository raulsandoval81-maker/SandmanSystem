import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const src = async (path) => readFile(new URL(path, root), "utf8");
const helper = await import("data:text/javascript;base64," +
  Buffer.from(await src("public/connect/proposals/review/monthly-period-disclosure.js")).toString("base64"));

test("Luca's two unpaid months appear separately in family-facing terms", () => {
  const terms = helper.monthlyPeriodDisclosure({
    membershipStartDate: "2026-10-01",
    firstRecurringChargeDate: "2026-12-05",
    monthlyBalance: 110,
    additionalMembershipMonthsDue: 1,
  });
  assert.equal(terms.firstMonthLabel, "First-month membership — October 2026");
  assert.equal(terms.additionalMonthsLabel, "November 2026");
  assert.equal(terms.additionalMonthsCharge, 110);
  assert.equal(terms.consecutiveMonths, true);
});

test("do not invent month names for proration or inconsistent dates", () => {
  for (const membershipStartDate of ["2026-10-15", "2026-10-01"]) {
    const terms = helper.monthlyPeriodDisclosure({
      membershipStartDate,
      firstRecurringChargeDate: membershipStartDate === "2026-10-01" ? "2027-01-05" : "2026-12-05",
      monthlyBalance: 110,
      additionalMembershipMonthsDue: 1,
    });
    assert.equal(terms.consecutiveMonths, false);
    assert.equal(terms.additionalMonthsLabel, "1 additional unpaid month");
  }
});

test("review stage has distinct remote, in-person and manual link handlers", async () => {
  const code = await src("public/connect/proposals/proposals.js");
  for (const pair of [
    ['data-proposal-action="open-client-review"', "Open In-Person Review"],
    ['data-proposal-action="email-client-review"', "Send Remote Review"],
    ['data-proposal-action="copy-client-review"', "Copy Secure Link — Alternative Delivery"],
  ]) {
    assert.ok(code.includes(pair[0]));
    assert.ok(code.includes(pair[1]));
  }
  assert.match(code, /const remote = action === "email-client-review"/);
});

test("remote status is not mistaken for proof of inbox delivery", async () => {
  const backend = await src("functions/src/proposals/issueProposalClientReview.ts");
  const audit = await src("public/connect/proposals/proposal-email-audit.js");
  assert.match(backend, /deliveryStatus === "sending"/);
  assert.match(backend, /deliveryStatus: sendEmail \? "sending" : "local"/);
  assert.match(backend, /recordDeliveryState\("unknown"/);
  assert.match(backend, /recordDeliveryState\("rejected"/);
  assert.match(backend, /"provider_accepted", undefined, emailId/);
  assert.match(backend, /cleanReviewString\(review\.tokenHash\) !== tokenHash/);
  assert.match(backend, /clientReviewRecoveryGate\(/);
  assert.match(backend, /CLIENT_REVIEW_DELIVERY_RECOVERY_REISSUED/);
  assert.match(audit, /deliveryStatus === "unknown"/);
  assert.match(audit, /accepted by provider/);
  assert.match(audit, /Reconcile & Reissue Remote Review/);
  assert.match(audit, /acknowledgeRevocation: true/);
});

test("acceptance requires signature and locked proposal before checkout", async () => {
  const acceptance = await src("functions/src/proposals/acceptProposalClientReview.ts");
  assert.match(acceptance, /"AWAITING_CLIENT_SIGNATURE"/);
  assert.match(acceptance, /hashProposalReviewToken/);
  assert.match(acceptance, /consentAccepted/);
  assert.match(acceptance, /"READY_FOR_CHECKOUT"/);
  const review = await src("public/connect/proposals/review/review.js");
  assert.match(review, /issueProposalEnrollmentHandoff/);
  assert.match(review, /monthlyPeriodDisclosure\(pricing\)/);
});

test("checkout must fail closed if amount or recurring date drifts after acceptance", async () => {
  const checkout = await src("functions/src/proposals/createProposalCheckout.ts");
  assert.match(checkout, /checkoutDueNow !== lockedDueNow/);
  assert.match(checkout, /resolvedFirstRecurringChargeDate !== firstRecurringChargeDate/);
  assert.match(checkout, /Management must issue updated terms for family review before checkout/);
});
