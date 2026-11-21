import test from "node:test";
import assert from "node:assert/strict";
import { applyProtectedDecay, resolveEarnedStripeFloor } from "../../functions/lib/modules/decay/earnedStripeFloorPolicy.js";

const base = {
  tier: "T2",
  stripeCount: 2,
  recognitionHistory: [{type:"STRIPE_AWARD",tier:2,stripe:2,date:"2026-10-01"}],
};
test("earned second stripe protects the 50% XP threshold",()=>{
  assert.equal(resolveEarnedStripeFloor({athlete:base,tier:"T2",xpCap:2400}),1200);
  assert.deepEqual(applyProtectedDecay({athlete:base,tier:"T2",xpCap:2400,beforeXp:1210,deduction:25}),
    {beforeXp:1210,afterXp:1200,floorXp:1200});
});
test("decay may still deduct XP above earned stripe floor",()=>{
  const result=applyProtectedDecay({athlete:base,tier:"T2",xpCap:2400,beforeXp:1500,deduction:25});
  assert.equal(result.afterXp,1475);
});
test("historical awarded stripe is preserved even if current counter was reset",()=>{
  const athlete={...base,stripeCount:0};
  assert.equal(resolveEarnedStripeFloor({athlete,tier:"T2",xpCap:2400}),1200);
});
test("previous-tier awards do not count in the active tier",()=>{
  const athlete={stripeCount:0,recognitionHistory:[{type:"STRIPE_AWARD",tier:1,stripe:4}]};
  assert.equal(resolveEarnedStripeFloor({athlete,tier:"T2",xpCap:2400}),0);
});
test("existing balance below protected floor fails closed instead of silently losing awards",()=>{
  assert.throws(()=>applyProtectedDecay({athlete:base,tier:"T2",xpCap:2400,beforeXp:1190,deduction:25}),
    /DECAY_EARNED_STRIPE_BALANCE_INCONSISTENT/);
});
test("unknown or missing stripe/rank authority blocks deductions",()=>{
  for(const athlete of [{},{stripeCount:-1},{stripeCount:5},{recognitionHistory:[]}])
    assert.throws(()=>applyProtectedDecay({athlete,tier:"T2",xpCap:2400,beforeXp:1500,deduction:25}),
      /DECAY_STRIPE_AUTHORITY_UNVERIFIED/);
  assert.throws(()=>applyProtectedDecay({athlete:base,tier:"UNKNOWN",xpCap:2400,beforeXp:1500,deduction:25}),
    /DECAY_STRIPE_AUTHORITY_UNVERIFIED/);
  assert.throws(()=>applyProtectedDecay({athlete:base,tier:"T2",xpCap:0,beforeXp:1500,deduction:25}),
    /DECAY_STRIPE_AUTHORITY_UNVERIFIED/);
});
test("highest issued stripe wins and no reduction occurs at floor",()=>{
  const athlete={stripeCount:1,recognitionHistory:[{type:"STRIPE_AWARD",tier:2,stripe:3}]};
  assert.equal(applyProtectedDecay({athlete,tier:"T2",xpCap:2400,beforeXp:1800,deduction:25}).afterXp,1800);
});
