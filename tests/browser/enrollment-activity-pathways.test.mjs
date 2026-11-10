import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/connect/proposals/activity/activity.js", "utf8");
const evaluate = (expression) => JSON.parse(runInNewContext(
  source.slice(source.indexOf("function isCashCheck"), source.indexOf("function esc")) +
  source.slice(source.indexOf("function lifecycleState"), source.indexOf("function lifecycleHtml")) +
  `JSON.stringify(${expression})`
));

test("confirmed Cash/Check shows Intake before verification and routes completed paperwork to Billing", () => {
  const result = evaluate(`(() => {
    const proposal = {status: "READY_FOR_CHECKOUT", lockedSnapshot: {pricing: {paymentArrangement: "prepaid_cash_check"}}};
    const cash = isCashCheck(proposal);
    const initial = lifecycleState(proposal, [], []);
    const submitted = lifecycleState(proposal, [{event: "INTAKE_SUBMITTED"}], []);
    return [enrollmentSteps(cash).map(x => x.key), initial.current, submitted.current,
      enrollmentAction(submitted.current, cash, "P-000003")];
  })()`);
  assert.deepEqual(result, [
    ["review", "signature", "intake", "payment", "activation"], "intake", "payment",
    ["Open Billing to Verify Cash/Check", "/management/billing/?proposalId=P-000003"],
  ]);
});

test("Stripe remains payment-first and paid Stripe routes to Management Enrollment", () => {
  assert.deepEqual(evaluate(`[
    enrollmentSteps(false).map(x => x.key),
    lifecycleState({status: "READY_FOR_CHECKOUT"}, [], []).current,
    enrollmentAction(lifecycleState({status: "PAID"}, [], []).current, false, "P-000004")
  ]`), [
    ["review", "signature", "payment", "intake", "activation"], "payment",
    ["Open Management Enrollment", "/intake-management/?proposalId=P-000004"],
  ]);
});
