const test = require("node:test");
const assert = require("node:assert/strict");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw Error("Emulator only");
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const db = getFirestore();
const callable = require("../lib/modules/skillCheckCoachCall").skillCheckCoachCall;
const athleteId = "F8_AUTH_SMOKE";
test.before(async () => {
 await db.doc("athletes/"+athleteId).set({locationId:"test-location",academyId:"test-academy"});
 await db.doc("staff/test-coach").set({role:"coach",status:"active",locationIds:["test-location"]});
 await db.doc("staff/test-manager").set({role:"management",status:"active",locationIds:["test-location"]});
});
test("authorized coach receives read-only diagnostics",async()=>{
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.eligibleForAuto,false);
 assert.equal(result.coverageComplete,false);
});
test("management cannot invoke coach callable",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-manager",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}}),e=>e.code==="permission-denied");
});

test("different authorized coach reads verified cross-Coach history",async()=>{
 const {Timestamp}=require("firebase-admin/firestore");
 await db.doc("staff/test-other-coach").set({role:"coach",status:"active",locationIds:["test-location"]});
 await db.doc("practiceSessions/test-cross-coach").set({coachUid:"test-coach",locationId:"test-location",academyId:"test-academy",discipline:"wrestling",sessionDateKey:"2026-10-08"});
 await db.doc("attendance_sessions/test-cross-coach").set({practiceId:"test-cross-coach",discipline:"wrestling",status:"finalized",finalized:true,presentIds:[athleteId]});
 await db.doc("practiceSessions/test-cross-coach/athletes/"+athleteId).set({practiceId:"test-cross-coach",athleteId,discipline:"wrestling",attendance:{status:"present"}});
 await db.doc("practiceSessions/test-cross-coach/athletes/"+athleteId+"/verifiedSkills/wrestling__double_leg").set({discipline:"wrestling",familyId:"double_leg",state:"LEARNED",coachUid:"test-coach",verifiedAt:Timestamp.fromDate(new Date("2026-10-08T18:00:00Z"))});
 const result=await callable.run({auth:{uid:"test-other-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.ok(result.practices.some(x=>x.practiceId==="test-cross-coach"));
 assert.equal(result.eligibleForAuto,false);
});
test("coach without athlete location is rejected",async()=>{
 await db.doc("staff/test-outsider").set({role:"coach",status:"active",locationIds:["outside-location"]});
 await assert.rejects(callable.run({auth:{uid:"test-outsider",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}}),e=>e.code==="permission-denied");
});
test("legacy academy scope is not granted to location-only coaches",async()=>{
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.ok(result.blockers.includes("scope-unavailable:athlete-academy"));
 assert.equal(result.eligibleForAuto,false);
});

test("historical memory without attendance produces a coverage blocker",async()=>{
 const id="test-memory-unresolved";
 await db.doc("practiceSessions/"+id).set({coachUid:"test-coach",locationId:"test-location",academyId:"test-academy",discipline:"wrestling",sessionDateKey:"2026-10-09"});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId).set({practiceId:id,athleteId,discipline:"wrestling",attendance:{status:"present"}});
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.ok(result.blockers.includes("unresolved-athlete-attendance:"+id));
 assert.equal(result.eligibleForAuto,false);
});

test("authorized academy coach retrieves legacy records without locationId",async()=>{
 const {Timestamp}=require("firebase-admin/firestore");
 const id="test-legacy-academy";
 await db.doc("staff/test-legacy-coach").set({role:"coach",status:"active",locationIds:["test-location"],academyIds:["test-academy"]});
 await db.doc("practiceSessions/"+id).set({coachUid:"test-legacy-coach",academyId:"test-academy",discipline:"wrestling",sessionDateKey:"2026-10-07"});
 await db.doc("attendance_sessions/"+id).set({practiceId:id,discipline:"wrestling",status:"finalized",finalized:true,presentIds:[athleteId]});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId).set({practiceId:id,athleteId,discipline:"wrestling",attendance:{status:"present"}});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId+"/verifiedSkills/wrestling__double_leg").set({discipline:"wrestling",familyId:"double_leg",state:"APPLIED",coachUid:"test-legacy-coach",verifiedAt:Timestamp.fromDate(new Date("2026-10-07T18:00:00Z"))});
 const result=await callable.run({auth:{uid:"test-legacy-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.ok(result.practices.some(p=>p.practiceId===id));
 assert.ok(result.checkedScopes.some(s=>s.scope==="athlete-academy"&&s.authorized));
 assert.equal(result.eligibleForAuto,false);
});

test("location-tagged history outside current athlete location is not imported via legacy academy",async()=>{
 const {Timestamp}=require("firebase-admin/firestore");
 const id="test-transferred-location";
 await db.doc("practiceSessions/"+id).set({coachUid:"test-legacy-coach",academyId:"test-academy",locationId:"former-location",discipline:"wrestling",sessionDateKey:"2026-10-06"});
 await db.doc("attendance_sessions/"+id).set({practiceId:id,discipline:"wrestling",status:"finalized",finalized:true,presentIds:[athleteId]});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId).set({practiceId:id,athleteId,discipline:"wrestling",attendance:{status:"present"}});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId+"/verifiedSkills/wrestling__double_leg").set({discipline:"wrestling",familyId:"double_leg",state:"MASTERED",coachUid:"test-legacy-coach",verifiedAt:Timestamp.fromDate(new Date("2026-10-06T18:00:00Z"))});
 await db.doc("staff/test-academy-reader").set({role:"coach",status:"active",locationIds:["test-location"],academyIds:["test-academy"]});
 const result=await callable.run({auth:{uid:"test-academy-reader",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.practices.some(p=>p.practiceId===id),false);
 assert.ok(result.blockers.includes("historical-transfer-coverage-unverified"));
 assert.equal(result.eligibleForAuto,false);
});

test("declared previous athlete locations remain unverified and require review",async()=>{
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["prior-training-location","test-location"]});
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.transferCoverage.priorLocationCount,1);
 assert.equal(result.transferCoverage.priorLocationsVerified,false);
 assert.equal(result.transferCoverage.requiresManagementReview,true);
 assert.ok(result.blockers.includes("prior-location-management-verification-required"));
 assert.equal(result.eligibleForAuto,false);
});

test("Admin can inspect declared prior-location evidence without authorizing AUTO",async()=>{
 const {Timestamp}=require("firebase-admin/firestore");
 const id="test-admin-prior-location";
 await db.doc("staff/test-admin-transfer").set({role:"admin",status:"active"});
 await db.doc("practiceSessions/"+id).set({coachUid:"former-coach",locationId:"prior-training-location",discipline:"wrestling",sessionDateKey:"2026-10-05"});
 await db.doc("attendance_sessions/"+id).set({practiceId:id,discipline:"wrestling",status:"finalized",finalized:true,presentIds:[athleteId]});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId).set({practiceId:id,athleteId,discipline:"wrestling",attendance:{status:"present"}});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId+"/verifiedSkills/wrestling__double_leg").set({discipline:"wrestling",familyId:"double_leg",state:"LEARNED",coachUid:"former-coach",verifiedAt:Timestamp.fromDate(new Date("2026-10-05T18:00:00Z"))});
 const result=await callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.ok(result.practices.some(p=>p.practiceId===id));
 assert.equal(result.transferCoverage.priorLocationsScanned,1);
 assert.equal(result.transferCoverage.priorLocationsVerified,false);
 assert.equal(result.eligibleForAuto,false);
});
test("Coach cannot read prior-location evidence merely because athlete declares it",async()=>{
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.practices.some(p=>p.practiceId==="test-admin-prior-location"),false);
 assert.ok(result.checkedScopes.some(scope=>scope.scope==="prior-location:prior-training-location"&&!scope.authorized));
 assert.equal(result.eligibleForAuto,false);
});

test("Admin prior-location scans are capped and explicitly report unscanned transfer history",async()=>{
 const ids=Array.from({length:12},(_,index)=>"prior-scan-location-"+index);
 await db.doc("athletes/"+athleteId).update({previousLocationIds:ids});
 const result=await callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.transferCoverage.priorLocationCount,12);
 assert.equal(result.transferCoverage.priorLocationsNotScanned,2);
 assert.equal(result.checkedScopes.filter(scope=>scope.scope.startsWith("prior-location:")).length,10);
 assert.ok(result.blockers.includes("prior-location-scan-limit-exceeded"));
 assert.equal(result.coverageComplete,false);
 assert.equal(result.eligibleForAuto,false);
});
