import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=await readFile(path.join(root,'public/connect/admissions/calculator/calculator.js'),'utf8');
const match=source.match(/export function normalizePrepaidFeeAllocations\([\s\S]*?\n}\n/);
assert.ok(match,'allocation normalizer must remain independently testable');
const moduleUrl='data:text/javascript;base64,'+Buffer.from(match[0]).toString('base64');
const {normalizePrepaidFeeAllocations}=await import(moduleUrl);

for(const percent of [0,25,50,75,100])test(`${percent}% support initializes net annual fee allocation`,()=>{
  const support=30*percent/100;
  assert.deepEqual(normalizePrepaidFeeAllocations({enrollmentBase:30,support,athleteCount:1}),[3000-support*100]);
});

test('saved and edited allocations clamp after support changes and restore safely',()=>{
  assert.deepEqual(normalizePrepaidFeeAllocations({enrollmentBase:30,support:15,athleteCount:1,previous:['30']}),[1500]);
  assert.deepEqual(normalizePrepaidFeeAllocations({enrollmentBase:30,support:30,athleteCount:1,restored:[{athleteIndex:1,amountCents:3000}]}),[0]);
  assert.deepEqual(normalizePrepaidFeeAllocations({enrollmentBase:30,support:0,athleteCount:1,previous:['5']}),[500]);
});

test('multi-athlete allocations use equal net per-athlete liability',()=>{
  assert.deepEqual(normalizePrepaidFeeAllocations({enrollmentBase:60,support:30,athleteCount:2}),[1500,1500]);
  assert.deepEqual(normalizePrepaidFeeAllocations({enrollmentBase:60,support:60,athleteCount:2}),[0,0]);
});

test('prepaid rendering clears every monthly metric and invalid review controls',()=>{
  for(const contract of [
    'el.firstYearTotal.textContent = money(t.amountCents / 100)',
    'el.annualTotal.textContent = "No automatic renewal"',
    'el.dueNow.textContent = "Unable to quote"',
    'el.firstYearTotal.textContent = "Unable to quote"',
    'el.annualTotal.textContent = "Unable to quote"',
    'const valid = !prepaid || paymentArrangementValid',
    'el.sendReviewButton.hidden = !draft || !valid',
  ])assert.ok(source.includes(contract),`missing Builder contract: ${contract}`);
  assert.match(source,/pricing\.paymentArrangement === "prepaid_stripe" \? "One-time Stripe payment" : "Existing cash\/check reconciliation"/);
  assert.match(source,/el\.printMonthly\.textContent = "No recurring charge"/);
  assert.match(source,/el\.printAnnualRenewal\.textContent = "No automatic renewal"/);
});

test('reload restores payment-specific review controls after generic draft labels',()=>{
  const loaded=source.match(/async function loadProposalDraft\(\)[\s\S]*?\n    function prefillFromAppointment/);
  assert.ok(loaded,'proposal reload implementation exists');
  const draft=loaded[0].match(/if \(proposalStatus === "DRAFT"\) \{[\s\S]*?\n      \} else \{/);
  assert.ok(draft,'draft reload branch exists');
  assert.match(draft[0],/el\.sendReviewButton\.textContent =\s*"Send for Review — Remote";\s*[\s\S]*?syncPaymentReviewActions\(\);/);
});

test('cash-check review uses family review only and invalid prepaid quote is blocked',()=>{
  const review=source.match(/async function beginProposalReview\([\s\S]*?\n    function renderProposalWorkflow/);
  assert.ok(review);
  assert.match(review[0],/!paymentArrangementValid \|\| !calculate\(\)/);
  assert.match(review[0],/"submitProposalForReview"/);
  assert.match(review[0],/"issueProposalClientReview"/);
  assert.doesNotMatch(review[0],/createProposalCheckout|stripeCheckout|createCheckoutSession/);
});
