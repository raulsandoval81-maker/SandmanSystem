// Integration gate for Manual Edge-Case Proposal. Emulator ONLY; never use production.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Refusing to run outside a Firestore emulator demo- project.");
}
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const callable = require("../lib/management/manualEdgeCaseProposal").manualEdgeCaseProposal;
const suffix = String(process.pid).padStart(6,"0").slice(-6);
const proposalId = "P-" + suffix;
const locationId = "manual-gate-a";
const manager = "manual-gate-manager-" + suffix;
const outsider = "manual-gate-outsider-" + suffix;
const disabled = "manual-gate-disabled-" + suffix;
const actionId = "manual-gate-action-" + suffix;
const id = (s) => "manual-gate-" + s + "-" + suffix;
const receipt = (which, period, rate) => ({
  paymentId:id(which), amountCents:10000, paymentMethod:"cash",
  membershipAmountCents:10000, enrollmentFeeAmountCents:0,
  unappliedMembershipAmountCents:0,
  requestedPeriods:[period],periods:[period],
  historicalMonthlyRateCents:rate,
  membershipPeriodAllocations:[{
    period, paidCents:10000, previouslyPaidCents:0,
    totalPaidCents:10000, requiredCents:rate, fullyPaid:true
  }]
});
const original = () => ({
  proposalId, locationId, status:"DRAFT",
  pricing:{monthlyBalance:80,enrollmentBase:30,
    membershipStartDate:"2026-09-01", firstRecurringChargeDate:"2026-11-05"},
  priorPayments:[receipt("september","2026-09",10000),receipt("october","2026-10",10000)]
});
const adjustments = () => [{
  paymentId:id("october"),enrollmentFeeAmountCents:2000,historicalMonthlyRateCents:8000
}];
const invoke = (uid, data) => callable.run({ auth:{ uid, token:{} },data });
const proposalRef = db.collection("proposals").doc(proposalId);
test.before(async () => {
  await Promise.all([
    db.doc("staff/"+manager).set({role:"management",status:"active",locationIds:[locationId]}),
    db.doc("staff/"+outsider).set({role:"management",status:"active",locationIds:["different-location"]}),
    db.doc("staff/"+disabled).set({role:"management",status:"inactive",locationIds:[locationId]}),
    proposalRef.set(original())
  ]);
});
test.after(async () => { await deleteApp(app); });
test("Management load exposes authorized financial fields, not full private proposal",async()=>{
  const result=await invoke(manager,{proposalId,mode:"load"});
  assert.equal(result.proposalId,proposalId);
  assert.equal(result.priorPayments.length,2);
  assert.equal(result.checkoutAuthorized,false);
  assert.equal(result.pricing.enrollmentBase,30);
});
test("Missing auth, inactive staff and outside-location Management are denied",async()=>{
  await assert.rejects(callable.run({data:{proposalId,mode:"load"}}),e=>e.code==="unauthenticated");
  await assert.rejects(invoke(disabled,{proposalId,mode:"load"}),e=>e.code==="permission-denied");
  await assert.rejects(invoke(outsider,{proposalId,mode:"load"}),e=>e.code==="permission-denied");
  await assert.rejects(invoke(outsider,{proposalId,mode:"preview",entries:adjustments()}),e=>e.code==="permission-denied");
});
test("Preview performs no writes and retains original collected receipts",async()=>{
  const before=(await proposalRef.get()).data();
  const preview=await invoke(manager,{proposalId,mode:"preview",entries:adjustments()});
  const after=(await proposalRef.get()).data();
  assert.deepEqual(after,before);
  assert.equal(preview.originalTotalCents,20000);
  assert.equal(preview.after.enrollmentRemainingCents,1000);
  assert.equal(preview.after.unappliedMembershipCents,0);
  assert.equal(preview.checkoutAuthorized,false);
});
test("Stale preview rejects an unrelated proposal change without audit write",async()=>{
  const preview=await invoke(manager,{proposalId,mode:"preview",entries:adjustments()});
  await proposalRef.update({"pricing.note":"altered after preview"});
  await assert.rejects(invoke(manager,{
    proposalId, mode:"commit", entries:adjustments(),expectedFingerprint:preview.fingerprint,
    reason:"Verified receipt allocation",actionId:actionId+"-stale"
  }),e=>e.code==="aborted");
  assert.equal((await proposalRef.collection("manualAdjustments").doc(actionId+"-stale").get()).exists,false);
});
test("Commit is atomic, auditable, retry-idempotent and does not alter receipt totals",async()=>{
  const preview=await invoke(manager,{proposalId,mode:"preview",entries:adjustments()});
  const input={proposalId,mode:"commit",entries:adjustments(),expectedFingerprint:preview.fingerprint,
    reason:"Verified September and October cash allocation",actionId};
  const saved=await invoke(manager,input);
  assert.equal(saved.ok,true);
  assert.equal(saved.idempotent,false);
  assert.equal(saved.checkoutAuthorized,false);
  const snap=await proposalRef.get();
  const data=snap.data();
  assert.equal(data.priorPayments.reduce((n,p)=>n+p.amountCents,0),20000);
  assert.equal(data.priorPayments[0].membershipAmountCents,10000);
  assert.equal(data.priorPayments[1].membershipAmountCents,8000);
  assert.equal(data.priorPayments[1].enrollmentFeeAmountCents,2000);
  assert.equal(saved.enrollmentRemainingCents,1000);
  const audit=await proposalRef.collection("history").doc(saved.auditId).get();
  assert.equal(audit.exists,true);
  assert.equal(audit.get("event"),"MANUAL_PROPOSAL_ALLOCATION_ADJUSTED");
  assert.equal(audit.get("priorPaymentsBefore")[1].amountCents,10000);
  assert.equal(audit.get("priorPaymentsAfter")[1].amountCents,10000);
  assert.equal(audit.get("stripeChargeCreated"),false);
  const again=await invoke(manager,input);
  assert.equal(again.idempotent,true);
  assert.equal(again.auditId,saved.auditId);
  await assert.rejects(invoke(manager,{...input,reason:"Altered historical justification"}),
    e=>e.code==="already-exists");
});
test("Already-adjusted proposal cannot commit an obsolete preview as a new action",async()=>{
  const preview=await invoke(manager,{proposalId,mode:"load"});
  assert.equal(preview.priorPayments[1].enrollmentFeeAmountCents,2000);
  await assert.rejects(invoke(manager,{
    proposalId,mode:"commit",entries:adjustments(),
    expectedFingerprint:"a".repeat(64),reason:"Repeat change without new preview",
    actionId:actionId+"-duplicate"
  }),e=>e.code==="failed-precondition"||e.code==="aborted");
});

test("verified $80 October and $30 fee support a separate $960 check without changing historical cash", async () => {
  const { verifyPrepaidConversionSource } = require("../lib/billing/prepaidConversionPolicy");
  const { canonicalPaymentArrangement } = require("../lib/billing/paymentArrangement");
  const appointmentId = id("conversion-appointment");
  const prospect = {appointmentId, email:"synthetic@example.invalid"};
  await db.collection("admissions_appointments").doc(appointmentId).set({
    locationId, email: prospect.email, athleteName: "Synthetic Edge Case",
  });
  const athletes = [{name:"Synthetic Edge Case", plan:"standard", billingTerm:"month-to-month"}];
  const prior = {...receipt("conversion", "2026-10", 10000), amountCents:11000,
    enrollmentFeeAmountCents:1000};
  await proposalRef.set({...original(), prospect, athletes, priorPayments:[prior]});
  const entries = [{paymentId:prior.paymentId, enrollmentFeeAmountCents:3000, historicalMonthlyRateCents:8000}];
  const preview = await invoke(manager,{proposalId,mode:"preview",entries,certifyConversion:true});
  assert.equal(preview.originalTotalCents,11000);
  assert.equal(preview.after.enrollmentRemainingCents,0);
  const request = {proposalId,mode:"commit",entries,certifyConversion:true,
    expectedFingerprint:preview.fingerprint,reason:"Verified synthetic discounted October and paid fee",
    actionId:actionId+"-conversion"};
  await assert.rejects(invoke(manager,{...request,certifyConversion:false}),e=>e.code==="aborted");
  const result = await invoke(manager,request);
  assert.equal((await invoke(manager,request)).idempotent,true);
  const source = (await proposalRef.get()).data();
  assert.equal(source.status,"DRAFT");
  assert.equal(source.priorPayments[0].amountCents,11000);
  assert.equal(source.priorPayments[0].membershipAmountCents,8000);
  assert.equal(source.priorPayments[0].enrollmentFeeAmountCents,3000);
  const audit = (await proposalRef.collection("history").doc(result.auditId).get()).data();
  assert.deepEqual(audit.priorPaymentsBefore,[prior]);
  const evidence = (await proposalRef.collection("manualAdjustments").doc("conversionEvidence").get()).data();
  const targetAthletes = [{...athletes[0],billingTerm:"annual"}];
  const pricing = canonicalPaymentArrangement({paymentArrangement:"prepaid_cash_check",monthlyBalance:80,
    enrollmentBase:30,enrollmentPreviouslyPaidAmount:30,membershipStartDate:"2026-11-01"},targetAthletes);
  const target = {proposalId:"P-999999",locationId,prospect,athletes:targetAthletes,pricing,lockedSnapshot:{pricing,athletes:targetAthletes,prospect}};
  const conversion = {sourceProposalId:proposalId,source,target,newMembershipStartDate:"2026-11-01",
    historicalEvidenceFingerprint:evidence.fingerprint};
  assert.equal(verifyPrepaidConversionSource(conversion).historicalEnrollmentCents,3000);
  assert.throws(()=>verifyPrepaidConversionSource({...conversion,historicalEvidenceFingerprint:undefined}),/verified PAID/);
  assert.throws(()=>verifyPrepaidConversionSource({...conversion,source:{...source,pricing:{...source.pricing,monthlyBalance:81}}}),/verified PAID/);
  assert.equal(pricing.prepaidTerms.amountCents,96000);
  assert.equal(pricing.prepaidTerms.annualEnrollmentFee.outstandingCents,0);
  assert.equal(pricing.prepaidTerms.paidThroughDate,"2027-10-31");

  const create = require("../lib/proposals/createProposalDraft").createProposalDraft;
  const createLinked = (overrides = {}) => create.run({auth:{uid:manager},data:{
    appointmentId, conversionSourceProposalId:proposalId, athletes:targetAthletes, pricing,
    agreement:{membershipStartDate:"2026-11-01"}, ...overrides,
  }});
  await assert.rejects(createLinked({athletes:[{...targetAthletes[0],name:"Different athlete"}]}),
    error=>error.code==="failed-precondition" && /same athletes/.test(error.message));
  const created = await createLinked();
  assert.notEqual(created.proposalId,proposalId);
  const targetRef = db.collection("proposals").doc(created.proposalId);
  const draft = (await targetRef.get()).data();
  assert.equal(draft.conversionSourceProposalId,proposalId);
  assert.equal(draft.pricing.prepaidTerms.amountCents,96000);
  assert.equal(draft.pricing.prepaidTerms.annualEnrollmentFee.previouslyPaidCents,3000);
  assert.equal(draft.priorPayments,undefined);
  assert.deepEqual((await proposalRef.get()).data(),source);
  const replay = await createLinked();
  assert.equal(replay.idempotent,true);
  assert.equal(replay.proposalId,created.proposalId);
  assert.equal((await targetRef.collection("history").get()).size,1);
});
