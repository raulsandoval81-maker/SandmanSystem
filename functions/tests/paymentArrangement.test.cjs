const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const admin = require('firebase-admin/firestore');
const {canonicalPaymentArrangement, lockedPrepaidTerms, prepaidFingerprint} = require('../lib/billing/paymentArrangement');
const {isOperationalPaidProposal} = require('../lib/enrollment/operationalPaidProposal');
function fixture(arrangement = 'prepaid_stripe', term = 'annual', fee = 2000, supportPercent = 0) {
  const athletes = [{name:'Synthetic Athlete',plan:'standard',billingTerm:term}];
  const pricing = canonicalPaymentArrangement({paymentArrangement:arrangement,monthlyBalance:80,
    enrollmentBase:30,support:30*supportPercent/100,supportPercent,
    membershipStartDate:'2026-11-01',prepaidFeeAllocations:[{athleteIndex:1,amountCents:fee}]}, athletes);
  const snapshot = {athletes,pricing};
  return {status:'READY_FOR_CHECKOUT',lockedSnapshot:snapshot,clientAcceptance:{signedSnapshot:snapshot,signedAt:admin.Timestamp.now()},
    enrollmentConfirmation:{termsConfirmed:true,confirmedAt:admin.Timestamp.now()},prospect:{email:'synthetic@example.invalid'}};
}
for (const [term,months,end] of [['annual',12,'2027-10-31'],['six-month',6,'2027-04-30']]) {
  test(`${months}-month prepaid totals, separate partial fee and exact coverage`,()=>{
    const p=fixture('prepaid_stripe',term);const t=lockedPrepaidTerms(p);
    assert.equal(t.membershipAmountCents,8000*months);assert.equal(t.amountCents,8000*months+2000);
    assert.equal(t.annualEnrollmentFee.outstandingCents,1000);assert.equal(t.paidThroughDate,end);
    assert.equal(t.automaticRenewal,false);
  });
}
for (const fee of [0,1000,3000]) test(`fee allocation ${fee} is independently preserved`,()=>{
  const p=fixture('prepaid_cash_check','annual',fee);assert.equal(p.lockedSnapshot.pricing.dueNow,0);
  assert.equal(lockedPrepaidTerms(p).annualEnrollmentFee.outstandingCents,3000-fee);
});
for (const percent of [0,25,50,75,100]) test(`${percent}% support reduces only enrollment liability`,()=>{
  const liability=3000*(100-percent)/100;
  const p=fixture('prepaid_cash_check','annual',liability,percent);
  const terms=lockedPrepaidTerms(p);
  assert.equal(terms.membershipAmountCents,96000);
  assert.equal(terms.amountCents,96000+liability);
  assert.equal(terms.nextBillingDate,'2027-11-01');
  assert.equal(terms.automaticRenewal,false);
  assert.equal(terms.annualEnrollmentFee.totalCents,liability);
  assert.equal(terms.annualEnrollmentFee.outstandingCents,0);
});
test('support preserves partial enrollment allocation and rejects inconsistent locked support',()=>{
  const p=fixture('prepaid_cash_check','annual',500,50);
  const terms=lockedPrepaidTerms(p);
  assert.equal(terms.membershipAmountCents,96000);
  assert.equal(terms.annualEnrollmentFee.totalCents,1500);
  assert.equal(terms.annualEnrollmentFee.outstandingCents,1000);
  assert.throws(()=>canonicalPaymentArrangement({paymentArrangement:'prepaid_cash_check',monthlyBalance:80,
    enrollmentBase:30,support:30,supportPercent:50,membershipStartDate:'2026-11-01',
    prepaidFeeAllocations:[{athleteIndex:1,amountCents:0}]},p.lockedSnapshot.athletes),/support/);
});
test('monthly path preserves existing prices and schedule byte for byte',()=>{
  const input={monthlyBalance:80,dueNow:110,firstRecurringChargeDate:'2026-12-05'};
  assert.equal(canonicalPaymentArrangement(input,[]),input);
});
test('invalid terms, allocation, mixed households, extras and signed drift reject',()=>{
  assert.throws(()=>fixture('prepaid_stripe','monthly'),/6- or 12-month/);
  assert.throws(()=>fixture('prepaid_stripe','annual',3001),/exceeds/);
  assert.throws(()=>fixture('garbage'),/Unsupported/);
  const p=fixture(); const raw={...p.lockedSnapshot.pricing};
  assert.throws(()=>canonicalPaymentArrangement(raw,[{plan:'standard',billingTerm:'annual'},{plan:'standard',billingTerm:'six-month'}]),/same agreement/);
  assert.throws(()=>canonicalPaymentArrangement({...raw,extraAmount:5},p.lockedSnapshot.athletes),/extra/);
  assert.throws(()=>canonicalPaymentArrangement({...raw,membershipStartDate:'2026-02-30'},p.lockedSnapshot.athletes),/invalid/);
  p.clientAcceptance.signedSnapshot={};assert.throws(()=>lockedPrepaidTerms(p),/Family acceptance/);
});

let document;let history=[];let createCalls=[];let stripeSessions=new Map();
const ref={collection(){return {doc(){return {history:true}}}}};
const db={collection(){return {doc(){return ref}}},async runTransaction(work){
  const writes=[];const result=await work({get:async()=>({exists:true,data:()=>document}),
    update:(_,values)=>writes.push(values),create:(_,values)=>history.push(values)});
  for(const values of writes) for(const [key,value] of Object.entries(values)){
    if(key.includes('.')){const [a,b]=key.split('.');document[a]??={};document[a][b]=value;}
    else { if(key==='prepaidCheckout' && value.createdAt?.constructor?.name==='ServerTimestampTransform') value.createdAt=admin.Timestamp.now(); document[key]=value; }
  }
  return result;
}};
const originalLoad=Module._load;
Module._load=function(id,...args){if(id==='firebase-admin/firestore')return {...admin,getFirestore:()=>db};return originalLoad.call(this,id,...args)};
const {createPrepaidProposalCheckout,handlePrepaidProposalPayment}=require('../lib/billing/prepaidProposalCheckout');
Module._load=originalLoad;
const stripe={checkout:{sessions:{async retrieve(id){return stripeSessions.get(id)},async create(params,options){
  createCalls.push({params,options});
  const prior=[...stripeSessions.values()].find(s=>s.key===options.idempotencyKey);if(prior)return prior;
  const session={...params,id:'cs_test_synthetic',url:'https://checkout.stripe.com/synthetic',status:'open',payment_status:'unpaid',key:options.idempotencyKey};
  stripeSessions.set(session.id,session);return session;
}}}};
function reset(p=fixture()){document=p;history=[];createCalls=[];stripeSessions.clear();}
const checkout=()=>createPrepaidProposalCheckout({stripe,db,proposalId:'P-SYNTHETIC',actorUid:'synthetic-staff',publicBaseUrl:'https://sandman-combat-staging.web.app'});
function paid(overrides={}){const session=stripeSessions.get('cs_test_synthetic');return {...session,
  mode:'payment',payment_status:'paid',payment_intent:'pi_synthetic',customer:'cus_synthetic',currency:'usd',
  amount_total:document.lockedSnapshot.pricing.prepaidTerms.amountCents,livemode:false,...overrides};}
test('checkout reuses session; no subscription; webhook records once and intake accepts staging only',async()=>{
  reset();await checkout();await checkout();assert.equal(createCalls.length,1);
  assert.equal(createCalls[0].params.mode,'payment');assert.equal(createCalls[0].params.subscription_data,undefined);
  const event=paid();await handlePrepaidProposalPayment(event);await handlePrepaidProposalPayment(event);
  assert.equal(history.length,1);assert.equal(document.status,'PAID');assert.equal(document.stripeSubscriptionId,undefined);
  assert.equal(document.prepaidPayment.annualEnrollmentFee.outstandingCents,1000);
  assert.equal(isOperationalPaidProposal(document,{GCLOUD_PROJECT:'sandman-combat-staging',SANDMAN_STAGING_ACK:'sandman-combat-staging',SANDMAN_STAGING_PROJECT_ID:'sandman-combat-staging'}),true);
  assert.equal(isOperationalPaidProposal(document,{GCLOUD_PROJECT:'sandmandashboard'}),false);
  await assert.rejects(checkout(),/not eligible/);
});
test('cash arrangement, unconfirmed terms and prior payments cannot create Stripe sessions',async()=>{
  reset(fixture('prepaid_cash_check'));await assert.rejects(checkout(),/not eligible/);
  reset();document.enrollmentConfirmation={};await assert.rejects(checkout(),/not eligible/);
  reset();document.priorPayments=[{membershipAmountCents:8000}];await assert.rejects(checkout(),/not eligible/);
  assert.equal(createCalls.length,0);
});
test('unpaid completion does not fulfill; async success can fulfill the same session',async()=>{
  reset();await checkout();await handlePrepaidProposalPayment(paid({payment_status:'unpaid'}));
  assert.equal(document.status,'CHECKOUT_CREATED');assert.equal(history.length,0);
  await handlePrepaidProposalPayment(paid());assert.equal(document.status,'PAID');
});
test('wrong amount, currency, mode, fingerprint or session cannot fulfill',async()=>{
  for(const changes of [{amount_total:1},{currency:'eur'},{mode:'subscription'},{subscription:'sub_bad'},
      {metadata:{proposalId:'P-SYNTHETIC',source:'membership_prepaid',fingerprint:'tampered'}},{id:'cs_test_wrong'}]){
    reset();await checkout();await assert.rejects(handlePrepaidProposalPayment(paid(changes)));
    assert.equal(document.status,'CHECKOUT_CREATED');assert.equal(history.length,0);
  }
});
test('expired paid session is never replaced with another charge',async()=>{
  reset();await checkout();stripeSessions.get('cs_test_synthetic').status='expired';
  await assert.rejects(checkout(),/another charge/);assert.equal(createCalls.length,1);
});
test('lost response beyond Stripe idempotency window requires manual reconciliation',async()=>{
  reset();document.prepaidCheckout={fingerprint:prepaidFingerprint(document),createdAt:admin.Timestamp.fromMillis(Date.now()-24*3600000)};
  await assert.rejects(checkout(),/recovery window expired/);assert.equal(createCalls.length,0);
});
test('concurrent callers receive one immutable Stripe checkout identity',async()=>{
  reset();const results=await Promise.all([checkout(),checkout()]);
  assert.equal(results[0].checkoutSessionId,results[1].checkoutSessionId);
  assert.equal(new Set(createCalls.map(c=>c.options.idempotencyKey)).size,1);
  assert.equal(stripeSessions.size,1);
});
test('failed create may retry the same claim without changing idempotency key',async()=>{
  reset();const original=stripe.checkout.sessions.create;let attempt=0;
  stripe.checkout.sessions.create=async(...args)=>{if(!attempt++)throw Error('network interrupted');return original(...args)};
  try{await assert.rejects(checkout(),/network/);const fingerprint=document.prepaidCheckout.fingerprint;
    await checkout();assert.equal(document.prepaidCheckout.fingerprint,fingerprint);
    assert.equal(createCalls[0].options.idempotencyKey,`membership-prepaid-P-SYNTHETIC-${fingerprint}`);
  }finally{stripe.checkout.sessions.create=original;}
});
