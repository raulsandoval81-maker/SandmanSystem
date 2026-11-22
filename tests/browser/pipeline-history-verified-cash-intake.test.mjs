import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/management/pipeline-history/pipeline-history.js", "utf8");
const take = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "Expected production helper was not found");
  return source.slice(a, b);
};
const helpers = [
  take("function clean(", "function esc("),
  take("function timestampMillis(", "function formatDate("),
  take("function stageFromProposalStatus(", "function labelForStage("),
  take("function attachVerifiedIntakeState(", "function activatedPipelineKeys(")
].join("\n");
const evalState = (expression) => JSON.parse(runInNewContext(helpers + "\nJSON.stringify(" + expression + ")", {}));

test("historical cash/check awaiting signature never advances on an Intake claim", () => {
  assert.deepEqual(evalState(`(() => {
    const record = {proposalId:"P-000021", proposalStatus:"AWAITING_CLIENT_SIGNATURE",
      proposals:[{status:"AWAITING_CLIENT_SIGNATURE",pricing:{paymentArrangement:"prepaid_cash_check"}}]};
    return [currentStage({...record, verifiedIntakeStatus:"submitted"}),cashCheckProgressLabel(record)];
  })()`), ["proposal_review","Historical Cash/Check: Awaiting family confirmation"]);
});

test("only a paid proposal with matched submitted Intake advances its stage", () => {
  assert.deepEqual(evalState(`(() => {
    const cases = [{proposalId:"P-000021",proposalStatus:"PAID"}, {proposalId:"P-000022",proposalStatus:"PAID"}];
    const linked = attachVerifiedIntakeState(cases,[{proposalId:"P-000021",status:"submitted"}]);
    return linked.map(record => [record.proposalId, currentStage(record)]);
  })()`), [["P-000021","intake_started"],["P-000022","ready_for_enrollment"]]);
});

test("cash/check progress requires recorded payment, not a draft or received letter", () => {
  assert.deepEqual(evalState(`(() => {
    const pricing = {paymentArrangement:"prepaid_cash_check"};
    const proposal = {status:"PAID",paymentStatus:"paid",paymentMethod:"cash_prepaid",
      prepaidReconciliation:{status:"RECORDED"},cashPrepayment:{amountCents:96000},pricing};
    const label = p => cashCheckProgressLabel({proposals:[p]});
    return [label(proposal),label({...proposal,prepaidReconciliation:{status:"AWAITING_FAMILY_CONFIRMATION"}}),
      label({...proposal,status:"AWAITING_CLIENT_SIGNATURE"})];
  })()`), ["Historical Cash/Check: Reconciled","Historical Cash/Check: Not yet reconciled",
      "Historical Cash/Check: Awaiting family confirmation"]);
});
