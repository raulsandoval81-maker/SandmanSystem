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
 const result=await callable.run({auth:{uid:"test-legacy-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.practices.some(p=>p.practiceId===id),false);
 assert.ok(result.blockers.includes("historical-transfer-coverage-unverified"));
 assert.equal(result.eligibleForAuto,false);
});
