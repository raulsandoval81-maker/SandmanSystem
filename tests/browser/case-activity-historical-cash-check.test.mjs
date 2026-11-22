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

test("Cash/Check has no Stripe checkout and preserves receipt then Intake then approval", () => {
  const keys = evaluate('enrollmentSteps(true).map(item => item.key)');
  assert.deepEqual(keys, ["review","signature","payment","receipt","intake","management_approval","activation"]);
  assert.equal(evaluate('enrollmentSteps(true).some(x => /Stripe checkout/i.test(x.label))'), false);
});
test("standard enrollment stays unchanged", () => {
  assert.deepEqual(evaluate('enrollmentSteps(false).map(item => item.key)'),
    ["review","signature","payment","intake","activation"]);
});
test("Cash/Check payment cannot pass on PAID label without recorded reconciliation", () => {
  const result = evaluate('(() => { const p={status:"PAID",pricing:{paymentArrangement:"prepaid_cash_check"}}; return [...lifecycleState(p, [], []).complete]; })()');
  assert.equal(result.includes("payment"), false);
  assert.equal(result.includes("receipt"), false);
});
test("recorded payment alone does not claim receipt, Intake, or Management approval", () => {
  const result = evaluate('(() => { const p={status:"PAID",paymentStatus:"paid",paymentMethod:"cash_prepaid",prepaidReconciliation:{status:"RECORDED"},cashPrepayment:{amountCents:96000}}; return [...lifecycleState(p, [], []).complete]; })()');
  assert.equal(result.includes("payment"), true);
  assert.equal(result.includes("receipt"), false);
  assert.equal(result.includes("intake"), false);
  assert.equal(result.includes("management_approval"), false);
});
