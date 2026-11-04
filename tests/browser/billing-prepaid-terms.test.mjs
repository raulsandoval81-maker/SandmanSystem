import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperSource = await readFile("public/management/billing/prepaid-terms.js", "utf8");
const { lockedPrepaidMonths, prepaidCoverageDates } =
  await import("data:text/javascript;base64," + Buffer.from(helperSource).toString("base64"));

const proposal = (terms) => ({
  lockedSnapshot: {
    athletes: terms.map((billingTerm) => ({
      plan: "standard", billingTerm
    }))
  }
});

test("locked prepaid duration is derived from the proposal, not a form selection", () => {
  assert.equal(lockedPrepaidMonths(proposal(["six-month"])), 6);
  assert.equal(lockedPrepaidMonths(proposal(["sixMonth", "6_month"])), 6);
  assert.equal(lockedPrepaidMonths(proposal(["annual", "12_month"])), 12);
  assert.equal(lockedPrepaidMonths(proposal(["annual", "six-month"])), null);
  assert.equal(lockedPrepaidMonths(proposal(["monthToMonth"])), null);
  assert.equal(lockedPrepaidMonths({}), null);
  assert.equal(lockedPrepaidMonths({lockedSnapshot: {athletes:[{plan:"fitness",billingTerm:"annual"}]}}), null);
});

test("prepaid coverage dates use 6/12 calendar months and never include paid-through in renewal", () => {
  assert.deepEqual(prepaidCoverageDates("2026-11-04",6),{
    paidThroughDate:"2027-05-03", nextBillingDate:"2027-05-04"
  });
  assert.deepEqual(prepaidCoverageDates("2026-11-04",12),{
    paidThroughDate:"2027-11-03", nextBillingDate:"2027-11-04"
  });
  assert.deepEqual(prepaidCoverageDates("2026-08-31",6),{
    paidThroughDate:"2027-02-27", nextBillingDate:"2027-02-28"
  });
  assert.equal(prepaidCoverageDates("2026-02-30",6),null);
  assert.equal(prepaidCoverageDates("2026-11-04",3),null);
});

test("Billing UI uses locked term and amount; original check date remains explicitly entered", async () => {
  const ui = await readFile("public/management/billing/billing.js", "utf8");
  assert.match(ui,/lockedPrepaidMonths\(proposal\)/);
  assert.match(ui,/lockedSnapshot\?\.pricing\?\.monthlyBalance \|\| 0\) \* monthsCovered/);
  assert.match(ui,/prepaidCoverageDates\(startDate, monthsCovered\)/);
  assert.doesNotMatch(ui,/getElementById\(\s*"prepaidCashNextBilling"\s*\)\.value = "";\s*document.getElementById\(\s*"prepaidCashNote"/);
  assert.match(ui,/getElementById\("prepaidCashPaymentDate"\)\.value = ""/);
  assert.match(ui,/recordPrepaidCashCall\(\{/);
});
