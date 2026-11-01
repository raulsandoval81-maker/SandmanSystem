// Integration gate for Manual Edge-Case Proposal. Emulator ONLY; never use production.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Refusing to run outside a Firestore emulator demo- project.");
}
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, "manual-proposal-gate-" + process.pid);
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
