import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const enrollment = readFileSync("public/intake-management/management.intake.js","utf8");
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
const twoCHandler = enrollment.slice(
  enrollment.indexOf("function wireReceiptFirstAction("),
  enrollment.indexOf("function wireReadyIntakeButtons(")
);

function wireSyntheticSend({
  promptValue = "approved@example.com",
  confirmed = true,
  intakeDelivery = {},
  receiptStatus = async () => ({status: "NOT_SENT"}),
} = {}) {
  const events = [];
  const feedback = {textContent: ""};
  const handoffStatus = {textContent: ""};
  const makeButton = () => ({
    dataset: {"ready-2c": "P-SYNTHETIC"},
    getAttribute: name => name === "data-ready-2c" ? "P-SYNTHETIC" : null,
    disabled: false,
    textContent: "Send Receipt & Intake Email",
    closest: () => ({querySelector: () => feedback}),
    click() { return list.handler({target: {closest: () => this}}); },
  });
  let button = makeButton();
  const list = {
    contains: candidate => candidate === button,
    addEventListener: (_event, handler) => { list.handler = handler; },
  };
  const sandbox = {
    list,
    $: () => handoffStatus,
    readyProposalMap: new Map([["P-SYNTHETIC", {
      paymentMethod: "cash_prepaid",
      prospect: {email: "fixture@example.invalid"},
    }]]),
    intakeAudienceForProposal: () => "parent_guardian",
    window: {
      prompt: (_message, initial) => { events.push(["prompt", initial]); return promptValue; },
      confirm: () => confirmed,
    },
    refresh2CReceiptStatus: async () => { events.push("status"); return receiptStatus(); },
    console: {error: () => {}},
    currentHandoffTokenId: "",
    currentHandoffAudience: "",
    generateIntakeInvite: async () => {
      events.push("token");
      sandbox.currentHandoffTokenId = "synthetic-token";
      return true;
    },
    httpsCallable: (_functions, name) => async () => {
      events.push(name);
      return {data: {ok: true, recipient: promptValue}};
    },
    functions: {},
    db: {},
    doc: () => ({}),
    getDoc: async () => ({data: () => intakeDelivery}),
    requireManagement: async () => ({}),
    loadReadyForIntake: async () => {},
    setIntakeConfirmation: () => {},
  };
  vm.runInNewContext(twoCHandler + "\nwireReceiptFirstAction(list);", sandbox);
  return {button, events, feedback, handoffStatus, refresh: () => { button = makeButton(); return button; }};
}

test("2C clears the placeholder prefill and blocks a manually entered placeholder", async () => {
  const {button, events, feedback} = wireSyntheticSend({promptValue: "fixture@example.invalid"});
  await button.click();
  assert.deepEqual(events, [["prompt", ""]]);
  assert.match(feedback.textContent, /placeholder/i);
});

test("2C reports cancellation without reading delivery state or requesting emails", async () => {
  for (const options of [{promptValue: null}, {confirmed: false}]) {
    const {button, events, feedback} = wireSyntheticSend(options);
    await button.click();
    assert.deepEqual(events, [["prompt", ""]]);
    assert.match(feedback.textContent, /Canceled before requesting/);
  }
});

test("2C reports a failed receipt-status read and restores the button without requesting emails", async () => {
  const {button, events, feedback, handoffStatus} = wireSyntheticSend({
    receiptStatus: async () => { throw new Error("read failed"); },
  });
  const attempt = button.click();
  assert.equal(button.disabled, true);
  assert.match(feedback.textContent, /Checking receipt status/);
  await attempt;
  assert.deepEqual(events, [["prompt", ""], "status"]);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Send Receipt & Intake Email");
  assert.match(feedback.textContent, /Receipt status unavailable.*No emails requested/);
  assert.equal(handoffStatus.textContent, feedback.textContent);
});

test("2C reports pending receipt delivery and leaves the token and email paths untouched", async () => {
  for (const status of ["SENDING", "UNKNOWN"]) {
    const {button, events, feedback} = wireSyntheticSend({receiptStatus: async () => ({status})});
    await button.click();
    assert.deepEqual(events, [["prompt", ""], "status"]);
    assert.match(feedback.textContent, /Receipt delivery is uncertain/);
    assert.equal(button.disabled, false);
  }
});

test("2C requests receipt before Intake after the status gate passes", async () => {
  const {button, events} = wireSyntheticSend();
  await button.click();
  assert.deepEqual(events, [
    ["prompt", ""], "status", "token",
    "sendProposalPrepaidCashReceipt", "sendEnrollmentIntakeEmail",
  ]);
});

test("2C skips an Intake email already recorded for the confirmed recipient", async () => {
  const {button, events, handoffStatus} = wireSyntheticSend({
    intakeDelivery: {deliveryStatus: "SENT", deliveredTo: "approved@example.com"},
  });
  await button.click();
  assert.deepEqual(events, [
    ["prompt", ""], "status", "token", "sendProposalPrepaidCashReceipt",
  ]);
  assert.match(handoffStatus.textContent, /Intake delivery is already recorded/);
});


test("2C delegated click still prompts once after the queue replaces the button", async () => {
  const {button, events, refresh} = wireSyntheticSend({confirmed: false});
  await button.click();
  const replacement = refresh();
  await button.click();
  await replacement.click();
  assert.deepEqual(events, [["prompt", ""], ["prompt", ""]]);
});
