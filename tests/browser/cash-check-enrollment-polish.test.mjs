import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const enrollment = readFileSync("public/intake-management/management.intake.js","utf8");
const billing = readFileSync("public/management/billing/billing.js","utf8");
const card = enrollment.slice(enrollment.indexOf("function renderReadyIntakeCard("), enrollment.indexOf("let readyProposalMap"));
function render(paymentMethod,audience="parent_guardian",status="NOT_SENT") {
  return vm.runInNewContext(card + ';renderReadyIntakeCard(proposal)', {
    proposal:{proposalId:"P-SYNTHETIC",locationId:"test",paymentMethod,athletes:[{name:"Synthetic Athlete"}]},
    intakeAudienceForProposal:()=>audience, receiptStatusText:()=>({status,label:status,recipient:""}),
    twoCIntakeStatuses:new Map(),twoCIntakeStatusText:()=>"Not sent",esc:String,paidProposalName:()=>"Synthetic Family",
  });
}
test("Cash/Check ready cards give one receipt-and-Intake action across audiences",()=>{
  for (const audience of ["parent_guardian","adult_athlete","unknown"]) {
    const html=render("cash_prepaid",audience);
    assert.match(html,/Send Receipt & Intake Email/);
    assert.doesNotMatch(html,/data-ready-(parent|adult|mark-text)=/);
    assert.equal((html.match(/data-ready-2c=/g)||[]).length,1);
  }
});
test("Stripe parent and adult ready cards retain standard handoff controls",()=>{
  for (const audience of ["parent_guardian","adult_athlete"]) {
    const html=render("stripe",audience);
    assert.match(html,/data-ready-mark-text=/);
    assert.match(html,audience==="adult_athlete"?/data-ready-adult=/:/data-ready-parent=/);
    assert.doesNotMatch(html,/data-ready-2c=/);
  }
});
test("Cash/Check pending provider attempts expose recovery controls",()=>{
  assert.match(render("cash_prepaid","parent_guardian","SENDING"),/data-receipt-resolve=/);
  assert.doesNotMatch(render("stripe","parent_guardian","SENDING"),/data-receipt-resolve=/);
});
test("Billing labels lead to Enrollment and keep renewal in closed disclosure",()=>{
  assert.match(billing,/Verify Cash\/Check Payment/);
  assert.match(billing,/href="\/intake-management\/\?proposalId=\$\{encodeURIComponent\(item.proposalId\)\}"[\s\S]*?Continue to Enrollment/);
  assert.match(billing,/<details class="billing-secondary-action">\s*<summary>Later: renewal arrangement<\/summary>[\s\S]*?data-approve-renewal-proposal-id=/);
  assert.doesNotMatch(billing,/<details[^>]*\bopen\b/);
});
