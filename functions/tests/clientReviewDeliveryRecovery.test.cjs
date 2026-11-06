const test = require("node:test");
const assert = require("node:assert/strict");
const { clientReviewRecoveryGate: gate } = require("../lib/proposals/clientReviewDeliveryRecovery");
const now = Date.UTC(2026,10,6,0);
const base = {nowMs:now,issuedAtMs:now-11*60*1000,recoveryExpectedIssuedAtMs:now-11*60*1000,hasRecovery:true};
test("normal review proceeds without recovery; stale recovery request fails closed",()=>{
 assert.equal(gate({...base,deliveryStatus:"REVIEW",hasRecovery:false}).allowed,true);
 assert.equal(gate({...base,deliveryStatus:"provider_accepted",hasRecovery:true}).allowed,false);
});
test("unknown or stale sending can reissue only with expected token issuance and explicit recovery",()=>{
 for(const deliveryStatus of ["unknown","sending"]){
  assert.equal(gate({...base,deliveryStatus}).allowed,true);
  assert.equal(gate({...base,deliveryStatus,hasRecovery:false}).allowed,false);
  assert.equal(gate({...base,deliveryStatus,recoveryExpectedIssuedAtMs:now-12*60*1000}).allowed,false);
  assert.equal(gate({...base,deliveryStatus,issuedAtMs:null}).allowed,false);
 }
});
test("sending state cannot be overridden while provider response can still arrive",()=>{
 assert.equal(gate({...base,deliveryStatus:"sending",issuedAtMs:now-5000,recoveryExpectedIssuedAtMs:now-5000}).allowed,false);
 assert.equal(gate({...base,deliveryStatus:"unknown",issuedAtMs:now-5000,recoveryExpectedIssuedAtMs:now-5000}).allowed,true);
});
