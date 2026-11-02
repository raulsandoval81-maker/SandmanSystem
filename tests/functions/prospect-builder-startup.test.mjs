import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(path, 'utf8');
const builder = read('public/connect/admissions/calculator/calculator.js');
const strip = source => source.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g, '').replace(/export /g, '');
const seasonalIds = ['billingProgram', 'seasonalSchedule', 'seasonalEnrollmentDate', 'seasonalPayInFull', 'lateEnrollmentReviewed'];

// Minimal DOM fixture exercises actual module startup, draft loading and pricing.
// No Firebase SDK, credentials, network, callable invocation or writes are allowed.
function harness(seasonal) {
  class Node {
    constructor() { this.value = ''; this.checked = false; this.textContent = ''; this.children = []; this.nodes = new Map(); this.listeners = []; this.parentElement = this; }
    addEventListener(...args) { this.listeners.push(args); }
    insertAdjacentElement() {}
    toggleAttribute() {}
    classList = {add(){},remove(){}};
    appendChild(node) { this.children.push(node); }
    append(...nodes) { this.children.push(...nodes); }
    set innerHTML(value) { this.html = value; if (!value) this.children = []; }
    get innerHTML() { return this.html || ''; }
    querySelector(selector) {
      if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
      return this.nodes.get(selector);
    }
    querySelectorAll(selector) {
      if (selector === '.athlete-card') return this.children;
      if (selector === '.discipline:checked') return [...this.nodes.entries()].filter(([key,node]) => key.startsWith('.discipline[') && node.checked).map(([,node]) => node);
      return [];
    }
  }
  const ids = new Map([...read('public/connect/admissions/calculator/index.html').matchAll(/id="([^"]+)"/g)].map(([,id]) => [id,new Node()]));
  if (!seasonal) seasonalIds.forEach(id => ids.delete(id));
  ids.get('athleteTemplate').content = { cloneNode: () => new Node() };
  const errors = []; const reads = [];
  const receipt = (period, membership, fee, rate) => ({ amountCents:10000, membershipAmountCents:membership, enrollmentFeeAmountCents:fee, historicalMonthlyRateCents:rate, unappliedMembershipAmountCents:0, membershipPeriodAllocations:[{period,paidCents:membership}] });
  const proposal = { status:'DRAFT', prospect:{familyName:'Fixture family'}, pricing:{enrollmentBase:30,monthlyBalance:80,membershipStartDate:'2026-10-01'}, priorPayments:[receipt('2026-09',10000,0,10000),receipt('2026-10',8000,2000,8000)], athletes:[{name:'Fixture athlete',plan:'standard',trainingAccess:'core-2',billingTerm:'annual',credit:0,disciplines:['boxing']}] };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-02T12:00:00'])); } }
  const context = vm.createContext({ URLSearchParams, Date:FixedDate, setTimeout, console:{log(){},error(...args){errors.push(args);}}, alert:message=>errors.push(message), window:{location:{search:'?proposalId=P-000019',pathname:'/connect/admissions/calculator/'}}, document:{ getElementById:id=>ids.get(id)||null, createElement:()=>new Node(), querySelector:()=>null, querySelectorAll:()=>[] }, auth:{currentUser:{getIdTokenResult:async()=>({})}},db:{},functions:{}, httpsCallable:()=>{throw Error('Unexpected callable');}, doc:(_db,collection,id)=>({collection,id}),getDoc:async ref=>{reads.push(ref);return {id:ref.id,exists:()=>true,data:()=>proposal};},renderManagementLifecycle(){} });
  for (const [path, name] of [
    ['public/assets/js/pricing/sandman-pricing-catalog.js','SANDMAN_PRICING_CATALOG'],
    ['public/assets/js/pricing/sandman-pricing-engine.js','calculateSandmanMembershipPricing'],
    ['public/management/shared/services/historical-payment-summary.js','historicalPaymentSummary']
  ]) context[name] = vm.runInContext(`(() => {${strip(read(path))}; return ${name};})()`,context);
  return { context, ids, errors, reads };
}

for (const seasonal of [false,true]) test(`monthly draft loads with seasonal controls ${seasonal ? 'present' : 'absent'}`, async () => {
  const h = harness(seasonal);
  vm.runInContext(strip(builder),h.context,{timeout:2000});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.errors,[]);
  assert.equal(h.reads.filter(ref=>ref.collection==='proposals').length,1);
  assert.equal(h.ids.get('familyName').value,'Fixture family');
  assert.equal(h.ids.get('dueNow').textContent,'$10');
  assert.equal(h.ids.get('monthlyTotal').textContent,'$80');
  const result = vm.runInContext('calculate()',h.context);
  assert.equal(result.pricing.firstRecurringChargeDate,'2026-11-05');
  if (seasonal) for (const id of seasonalIds) assert.equal(h.ids.get(id).listeners.length,2);
});
