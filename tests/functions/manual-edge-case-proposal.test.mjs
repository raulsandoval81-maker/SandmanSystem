import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const root = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { buildManualProposalAdjustment } = require(`${root}/management/manualEdgeCaseProposalPolicy.js`);
const basePayment = (id, period, rate) => ({
  paymentId: id, amountCents: 10000, paymentMethod: "cash",
  membershipAmountCents: 10000, enrollmentFeeAmountCents: 0,
  unappliedMembershipAmountCents: 0,
  requestedPeriods: [period], periods: [period],
  membershipPeriodAllocations: [{period,paidCents:10000,requiredCents:rate,
    previouslyPaidCents:0,totalPaidCents:10000,fullyPaid:true}],
  historicalMonthlyRateCents:rate
});
const proposal = () => ({
  proposalId:"P-000155", locationId:"santa-ynez-valley", status:"DRAFT",
  pricing:{monthlyBalance:80,enrollmentBase:30,membershipStartDate:"2026-09-01",
    firstRecurringChargeDate:"2026-11-05"},
  priorPayments:[
    basePayment("receipt-sep","2026-09",10000),
    basePayment("receipt-oct","2026-10",10000)
  ]
});
const october = [{paymentId:"receipt-oct",enrollmentFeeAmountCents:2000,historicalMonthlyRateCents:8000}];
test("Generic existing-proposal September $100 / October $80 + $20 adjustment preserves receipts", () => {
 const result = buildManualProposalAdjustment(proposal(),october);
 assert.equal(result.originalTotalCents,20000);
 assert.equal(result.afterSummary.enrollmentPaidCents,2000);
 assert.equal(result.afterSummary.enrollmentRemainingCents,1000);
 assert.equal(result.afterSummary.unappliedMembershipCents,0);
 assert.deepEqual(result.afterSummary.fullyPaidPeriods,["2026-09","2026-10"]);
 assert.equal(result.afterPayments[0].historicalMonthlyRateCents,10000);
 assert.equal(result.afterPayments[1].historicalMonthlyRateCents,8000);
 assert.equal(result.afterPayments[1].enrollmentFeeAmountCents,2000);
 assert.equal(result.checkoutAuthorized,false);
});
test("Previously misallocated September surplus can be resolved as $100 earned at its historical rate", () => {
 const p=proposal();
 p.priorPayments[0].historicalMonthlyRateCents=8000;
 p.priorPayments[0].unappliedMembershipAmountCents=2000;
 p.priorPayments[0].membershipPeriodAllocations[0].paidCents=8000;
 p.priorPayments[0].membershipPeriodAllocations[0].totalPaidCents=8000;
 p.priorPayments[0].membershipPeriodAllocations[0].requiredCents=8000;
 p.priorPayments[1].unappliedMembershipAmountCents=2000;
 p.priorPayments[1].membershipPeriodAllocations[0].paidCents=8000;
 p.priorPayments[1].membershipPeriodAllocations[0].totalPaidCents=8000;
 p.priorPayments[1].membershipPeriodAllocations[0].requiredCents=8000;
 p.priorPayments[1].historicalMonthlyRateCents=8000;
 const outcome=buildManualProposalAdjustment(p,[
  {paymentId:"receipt-sep",enrollmentFeeAmountCents:0,historicalMonthlyRateCents:10000},
  {paymentId:"receipt-oct",enrollmentFeeAmountCents:2000,historicalMonthlyRateCents:8000},
 ]);
 assert.equal(outcome.originalTotalCents,20000);
 assert.equal(outcome.afterSummary.unappliedMembershipCents,0);
 assert.equal(outcome.afterSummary.enrollmentRemainingCents,1000);
 assert.deepEqual(outcome.afterSummary.fullyPaidPeriods,["2026-09","2026-10"]);
});

test("Adjustment is reusable across proposal and receipt IDs", () => {
 const p=proposal();
 p.proposalId="P-000888";
 p.priorPayments[1].paymentId="another-receipt";
 const result=buildManualProposalAdjustment(p,[{...october[0],paymentId:"another-receipt"}]);
 assert.equal(result.afterSummary.enrollmentRemainingCents,1000);
});
test("No invented receipts, duplicate selections, or change to collected amount",()=>{
 assert.throws(()=>buildManualProposalAdjustment(proposal(),[{...october[0],paymentId:"new"}]),/existing receipt/);
 assert.throws(()=>buildManualProposalAdjustment(proposal(),[october[0],october[0]]),/different existing receipt/);
 assert.throws(()=>buildManualProposalAdjustment(proposal(),[{...october[0],enrollmentFeeAmountCents:12000}]),/Invalid enrollment/);
});
test("Reject signed, paid, active checkout, and recorded cash-disposition cases",()=>{
 for(const overrides of [{status:"PAID"},{status:"CLIENT_SIGNED"},
  {clientReview:{tokenHash:"abc"}},{lockedSnapshot:{pricing:{}}},
  {stripeSubscriptionId:"sub123"},{pendingCheckoutSessionId:"cs_123"},
  {historicalCashDisposition:{status:"recorded"}}]) {
  assert.throws(()=>buildManualProposalAdjustment({...proposal(),...overrides},october),/unsigned, uncharged Draft/);
 }
});
test("Reject enrollment over-allocation and multi-month receipts",()=>{
 const p=proposal();
 p.priorPayments[0].enrollmentFeeAmountCents=2000;
 p.priorPayments[0].membershipAmountCents=8000;
 p.priorPayments[0].membershipPeriodAllocations[0].paidCents=8000;
 p.priorPayments[0].membershipPeriodAllocations[0].requiredCents=8000;
 p.priorPayments[0].historicalMonthlyRateCents=8000;
 assert.throws(()=>buildManualProposalAdjustment(p,[{...october[0],enrollmentFeeAmountCents:2000}]),/exceed/);
 const m=proposal();
 m.priorPayments[1].requestedPeriods=["2026-09","2026-10"];
 assert.throws(()=>buildManualProposalAdjustment(m,october),/multiple or unknown/);
});
test("A changed ledger invalidates the preview fingerprint",()=>{
 const p=proposal();
 const one=buildManualProposalAdjustment(p,october);
 p.priorPayments[0].note="New evidence";
 const two=buildManualProposalAdjustment(p,october);
 assert.notEqual(one.fingerprint,two.fingerprint);
});
test("No money creation or Stripe API in standalone adjustment executor",()=>{
 const src=readFileSync("functions/src/management/manualEdgeCaseProposal.ts","utf8");
 assert.match(src,/db\.runTransaction/);
 assert.match(src,/expectedFingerprint !== result\.fingerprint/);
 assert.match(src,/tx\.create\(historyRef/);
 assert.match(src,/tx\.create\(actionRef/);
 assert.doesNotMatch(src,/getStripe\(|stripe\.checkout|stripe\.paymentIntents|stripe\.refunds/);
});

test("Manual tool loads records only through location-scoped Management backend",()=>{
 const server=readFileSync("functions/src/management/manualEdgeCaseProposal.ts","utf8");
 const client=readFileSync("public/management/manual-edge-case-proposal/tool.js","utf8");
 assert.match(server,/mode === "load"/);
 assert.match(server,/requireProposalLocationAccess\(staff, proposal.locationId\)/);
 assert.match(server,/proposal\.pricing\?\.monthlyBalance/);
 assert.match(client,/mode: "load"/);
 assert.doesNotMatch(client,/getDoc\(|getDocs\(|collection\("proposals"/);
});

test("Never reallocate Stripe-backed or unknown-method receipts",()=>{
 const p=proposal(); p.priorPayments[0].paymentMethod="stripe";
 assert.throws(()=>buildManualProposalAdjustment(p,october),/cash\/check/);
 const q=proposal(); q.priorPayments[0].stripePaymentIntentId="pi_test";
 assert.throws(()=>buildManualProposalAdjustment(q,october),/cash\/check/);
});
