import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const termsUrl = new URL('../../public/management/billing/prepaid-terms.js', import.meta.url);
const terms = await import('data:text/javascript;base64,'+Buffer.from(await readFile(termsUrl,'utf8')).toString('base64'));
let source = await readFile(new URL('../../public/connect/admissions/calculator/payment-arrangement.js',import.meta.url),'utf8');
const importedTerms = 'data:text/javascript;base64,'+Buffer.from(await readFile(termsUrl,'utf8')).toString('base64');
source=source.replace('"/management/billing/prepaid-terms.js"',JSON.stringify(importedTerms));
const {previewPaymentArrangement}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const price={monthlyBalance:80,enrollmentBase:30,membershipStartDate:'2026-11-01',dueNow:110};
for(const [term,months] of [['annual',12],['six-month',6]]) {
 test(`Builder previews ${months}-month online and cash arrangements without changing the locked rate`,()=>{
  const athletes=[{name:'Synthetic',plan:'standard',billingTerm:term}];
  const allocations=[{athleteIndex:1,amountCents:2000}];
  const online=previewPaymentArrangement(price,athletes,'prepaid_stripe',allocations);
  const cash=previewPaymentArrangement(price,athletes,'prepaid_cash_check',allocations);
  assert.equal(online.dueNow,80*months+20);assert.equal(cash.dueNow,0);
  assert.equal(online.monthlyBalance,80);assert.equal(cash.prepaidTerms.feeOutstandingCents,1000);
  assert.equal(online.prepaidTerms.paidThroughDate,terms.prepaidCoverageDates(price.membershipStartDate,months).paidThroughDate);
 });
}
for (const percent of [0,25,50,75,100]) test(`Builder applies ${percent}% support to prepaid fee liability only`,()=>{
 const liability=3000*(100-percent)/100;
 const supported={...price,support:30*percent/100,supportPercent:percent};
 const preview=previewPaymentArrangement(supported,[{name:'Synthetic',plan:'standard',billingTerm:'annual'}],
   'prepaid_cash_check',[{athleteIndex:1,amountCents:liability}]);
 const terms=preview.prepaidTerms;
 assert.equal(terms.membershipAmountCents,96000);
 assert.equal(terms.amountCents,96000+liability);
 assert.equal(terms.nextBillingDate,'2027-11-01');
 assert.equal(preview.automaticFuturePayments,false);
 assert.equal(terms.feeOutstandingCents,0);
});
test('Builder preserves a partial allocation against supported enrollment liability',()=>{
 const terms=previewPaymentArrangement({...price,support:15,supportPercent:50},
   [{name:'Synthetic',plan:'standard',billingTerm:'annual'}],'prepaid_cash_check',
   [{athleteIndex:1,amountCents:500}]).prepaidTerms;
 assert.equal(terms.membershipAmountCents,96000);
 assert.equal(terms.amountCents,96500);
 assert.equal(terms.feeOutstandingCents,1000);
});
test('Builder preserves monthly pricing and rejects mixed terms, extra fees and invalid allocations',()=>{
 assert.equal(previewPaymentArrangement(price,[],'monthly_autopay',[]).dueNow,110);
 const athletes=[{plan:'standard',billingTerm:'annual'}];
 assert.throws(()=>previewPaymentArrangement(price,athletes,'prepaid_stripe',[{athleteIndex:1,amountCents:3001}]),/allocation/);
 assert.throws(()=>previewPaymentArrangement(price,[{plan:'standard',billingTerm:'monthly'}],'prepaid_stripe',[]),/6- or 12-month/);
 assert.throws(()=>previewPaymentArrangement({...price,extraAmount:5},athletes,'prepaid_cash_check',[]),/extras/);
});
test('Builder recovers across monthly, Stripe prepaid and cash/check switching',()=>{
 const athletes=[{name:'Synthetic',plan:'standard',billingTerm:'annual'}];
 const allocations=[{athleteIndex:1,amountCents:0}];
 const monthly=previewPaymentArrangement(price,athletes,'monthly_autopay',allocations);
 assert.equal(monthly.dueNow,110);
 const stripe=previewPaymentArrangement({...price,support:30,supportPercent:100},athletes,'prepaid_stripe',allocations);
 assert.equal(stripe.dueNow,960);
 assert.equal(stripe.prepaidTerms.feeOutstandingCents,0);
 assert.throws(()=>previewPaymentArrangement(price,athletes,'prepaid_cash_check',[{athleteIndex:1,amountCents:3001}]),/allocation/);
 const cash=previewPaymentArrangement({...price,support:30,supportPercent:100},athletes,'prepaid_cash_check',allocations);
 assert.equal(cash.dueNow,0);
 assert.equal(cash.automaticFuturePayments,false);
 assert.equal(cash.prepaidTerms.membershipAmountCents,96000);
 assert.equal(previewPaymentArrangement(price,athletes,'monthly_autopay',allocations).monthlyBalance,80);
});
test('Builder canonicalizes supported multi-athlete prepaid allocation',()=>{
 const athletes=[
  {name:'One',plan:'standard',billingTerm:'annual'},
  {name:'Two',plan:'standard',billingTerm:'annual'},
 ];
 const pricing={...price,monthlyBalance:160,enrollmentBase:60,support:30,supportPercent:50};
 const cash=previewPaymentArrangement(pricing,athletes,'prepaid_cash_check',[
  {athleteIndex:1,amountCents:1500},{athleteIndex:2,amountCents:0},
 ]);
 assert.equal(cash.prepaidTerms.membershipAmountCents,192000);
 assert.equal(cash.prepaidTerms.amountCents,193500);
 assert.equal(cash.prepaidTerms.feeOutstandingCents,1500);
});

const enrollmentStageUrl = new URL('../../public/management/enrollment-flow/enrollment-stage.js',import.meta.url);
const stageModule = await import('data:text/javascript;base64,' +
  Buffer.from(await readFile(enrollmentStageUrl,'utf8')).toString('base64'));
test('paid prepaid conversion stays in Enrollment until parent Intake is sent', () => {
  const proposal={status:'PAID',paymentMethod:'cash_prepaid',
    billingFollowUpStatus:'RENEWAL_AUTOPAY_APPROVAL_REQUIRED'};
  assert.equal(stageModule.enrollmentStage(proposal,null).key,'ENROLLMENT');
  assert.match(stageModule.enrollmentStage(proposal,null).next,/intake/i);
  assert.equal(stageModule.enrollmentStage(proposal,{status:'invited'}).key,'INTAKE');
  assert.equal(stageModule.enrollmentStage(proposal,{status:'submitted'}).key,'INTAKE');
  assert.equal(stageModule.enrollmentStage(proposal,{status:'approved'}).key,'ACTIVATION');
  assert.equal(stageModule.enrollmentStage(proposal,{status:'approved',approvedUid:'F8-DEMO'}).key,'ACTIVATION');
});
test('unpaid and closed cases retain safe Enrollment Flow classification', () => {
  assert.equal(stageModule.enrollmentStage({status:'READY_FOR_CHECKOUT'},null).key,'PAYMENT');
  assert.equal(stageModule.enrollmentStage({status:'VOID'},null).key,'CLOSED');
});
