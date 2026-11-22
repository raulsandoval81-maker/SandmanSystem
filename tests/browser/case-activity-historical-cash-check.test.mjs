import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/connect/proposals/activity/activity.js", "utf8");
const take = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "Missing Case Activity helper");
  return source.slice(a, b);
};
const helpers = [
  take("function isCashCheck(", "function esc("),
  take("function lifecycleState(", "function lifecycleHtml(")
].join("\n");
const evaluate = expression => JSON.parse(runInNewContext(helpers + "\nJSON.stringify(" + expression + ")", {}));

test("Cash/Check has no extra confirmation and one combined receipt + Intake delivery", () => {
  const keys = evaluate('enrollmentSteps(true).map(item => item.key)');
  assert.deepEqual(keys, ["review","payment","combined_delivery","intake","management_approval","activation"]);
  assert.equal(evaluate('enrollmentSteps(true).some(x => /Family Confirmation|Stripe checkout/i.test(x.label))'), false);
});
test("standard enrollment stays unchanged", () => {
  assert.deepEqual(evaluate('enrollmentSteps(false).map(item => item.key)'),
    ["review","signature","payment","intake","activation"]);
});
test("Cash/Check payment cannot pass on PAID label without recorded reconciliation", () => {
  const result = evaluate('(() => { const p={status:"PAID",pricing:{paymentArrangement:"prepaid_cash_check"}}; return [...lifecycleState(p, [], []).complete]; })()');
  assert.equal(result.includes("payment"), false);
  assert.equal(result.includes("combined_delivery"), false);
});
test("recorded payment alone does not claim combined delivery, Intake, or Management approval", () => {
  const result = evaluate('(() => { const p={status:"PAID",paymentStatus:"paid",paymentMethod:"cash_prepaid",prepaidReconciliation:{status:"RECORDED"},cashPrepayment:{amountCents:96000}}; return [...lifecycleState(p, [], []).complete]; })()');
  assert.equal(result.includes("payment"), true);
  assert.equal(result.includes("combined_delivery"), false);
  assert.equal(result.includes("intake"), false);
  assert.equal(result.includes("management_approval"), false);
});

test("combined receipt and Intake invite require both accepted delivery events", () => {
  const p = '{status:"PAID",paymentStatus:"paid",paymentMethod:"cash_prepaid",prepaidReconciliation:{status:"RECORDED"},cashPrepayment:{amountCents:96000}}';
  const onlyReceipt = evaluate('(() => {const p='+p+'; return [...lifecycleState(p,[{event:"COMBINED_RECEIPT_SENT"}],[]).complete];})()');
  assert.equal(onlyReceipt.includes("combined_delivery"), false);
  const both = evaluate('(() => {const p='+p+'; return [...lifecycleState(p,[{event:"COMBINED_RECEIPT_SENT"},{event:"INTAKE_INVITE_SENT"}],[]).complete];})()');
  assert.equal(both.includes("combined_delivery"), true);
  assert.equal(both.includes("intake"), false);
});
test("unreconciled proposal cannot claim combined delivery despite delivery events", () => {
  const result = evaluate('(() => { const p={status:"AWAITING_CLIENT_SIGNATURE",pricing:{paymentArrangement:"prepaid_cash_check"}}; return [...lifecycleState(p,[{event:"COMBINED_RECEIPT_SENT"},{event:"INTAKE_INVITE_SENT"}],[]).complete]; })()');
  assert.equal(result.includes("combined_delivery"), false);
});
