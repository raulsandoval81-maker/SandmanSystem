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
 assert.equal(result.checkedScopes.some(scope=>scope.scope.startsWith("prior-location:")),false);
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

test("Admin transfer review packet is pending and never approves discovered evidence",async()=>{
 const ids=["prior-training-location","missing-transfer-location"];
 await db.doc("athletes/"+athleteId).update({previousLocationIds:ids});
 const result=await callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.transferReview.status,"PENDING_MANAGEMENT_REVIEW");
 assert.equal(result.transferReview.evidenceApproved,false);
 assert.deepEqual(result.transferReview.locations.map(item=>item.locationId),ids);
 assert.ok(result.transferReview.locations.every(item=>item.scanAuthorized&&item.scanCompleted&&item.reviewRequired));
 assert.ok(result.transferReview.locations.some(item=>item.locationId==="prior-training-location"&&item.practiceCount>=1));
 assert.equal(result.eligibleForAuto,false);
});
test("Coach receives review requirement but no Admin transfer-location review details",async()=>{
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling"}});
 assert.equal(result.transferReview.status,"ADMIN_REVIEW_REQUIRED");
 assert.equal(result.transferReview.evidenceApproved,false);
 assert.equal(Object.hasOwn(result.transferReview,"locations"),false);
 assert.equal(result.checkedScopes.some(scope=>scope.scope.startsWith("prior-location:")),false);
 assert.equal(result.eligibleForAuto,false);
});

test("Admin opens idempotent pending transfer review without approving evidence",async()=>{
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["prior-training-location","test-location"]});
 const request={auth:{uid:"test-admin-transfer",token:{}},data:{action:"open-transfer-review",athleteId,discipline:"wrestling"}};
 const first=await callable.run(request);
 const second=await callable.run(request);
 assert.equal(first.created,true);
 assert.equal(second.created,false);
 assert.equal(first.evidenceApproved,false);
 assert.equal(first.eligibleForAuto,false);
 const snap=await db.doc("athletes/"+athleteId+"/historicalTransferReviews/wrestling").get();
 assert.equal(snap.data().status,"PENDING_MANAGEMENT_REVIEW");
 assert.deepEqual(snap.data().declaredPriorLocationIds,["prior-training-location"]);
 assert.equal(snap.data().coverageComplete,false);
 assert.equal(snap.data().evidenceApproved,false);
});
test("Coach cannot create transfer review or approve historical evidence",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{action:"open-transfer-review",athleteId,discipline:"wrestling"}}),e=>e.code==="permission-denied");
});

test("Admin review becomes stale when declared athlete locations change",async()=>{
 const req={auth:{uid:"test-admin-transfer",token:{}},data:{action:"get-transfer-review-status",athleteId,discipline:"wrestling"}};
 const initial=await callable.run(req);
 assert.equal(initial.status,"PENDING_MANAGEMENT_REVIEW");
 assert.equal(initial.stale,false);
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["different-former-location"]});
 const changed=await callable.run(req);
 assert.equal(changed.status,"STALE_REVIEW");
 assert.equal(changed.stale,true);
 assert.equal(changed.evidenceApproved,false);
 assert.equal(changed.eligibleForAuto,false);
});
test("Coach cannot inspect transfer review location details",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{action:"get-transfer-review-status",athleteId,discipline:"wrestling"}}),e=>e.code==="permission-denied");
});

test("Admin refreshes stale transfer review and resets review to pending without evidence approval",async()=>{
 const request={auth:{uid:"test-admin-transfer",token:{}},data:{action:"refresh-transfer-review",athleteId,discipline:"wrestling"}};
 const first=await callable.run(request);
 assert.equal(first.refreshed,true);
 const status=await callable.run({auth:request.auth,data:{action:"get-transfer-review-status",athleteId,discipline:"wrestling"}});
 assert.equal(status.stale,false);
 assert.equal(status.status,"PENDING_MANAGEMENT_REVIEW");
 const second=await callable.run(request);
 assert.equal(second.refreshed,false);
 const snap=await db.doc("athletes/"+athleteId+"/historicalTransferReviews/wrestling").get();
 assert.equal(snap.data().revision,2);
 assert.equal(snap.data().evidenceApproved,false);
 assert.equal(snap.data().coverageComplete,false);
 assert.equal(snap.data().eligibleForAuto,false);
});
test("Coach cannot refresh transfer review",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{action:"refresh-transfer-review",athleteId,discipline:"wrestling"}}),e=>e.code==="permission-denied");
});

test("Admin rejection is audited, final, and never unlocks progression",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["different-former-location"]});
 const result=await callable.run({auth,data:{action:"reject-transfer-review",athleteId,discipline:"wrestling",reason:"Source evidence could not be authenticated."}});
 assert.equal(result.status,"REJECTED");
 assert.equal(result.eligibleForAuto,false);
 const snap=await db.doc("athletes/"+athleteId+"/historicalTransferReviews/wrestling").get();
 assert.equal(snap.data().evidenceApproved,false);
 assert.equal(snap.data().status,"REJECTED");
 const audit=await db.collection("athletes/"+athleteId+"/historicalTransferReviews/wrestling/decisions").get();
 assert.equal(audit.size,1);
 assert.equal(audit.docs[0].data().actorUid,"test-admin-transfer");
 const status=await callable.run({auth,data:{action:"get-transfer-review-status",athleteId,discipline:"wrestling"}});
 assert.equal(status.status,"REJECTED");
 await assert.rejects(callable.run({auth,data:{action:"reject-transfer-review",athleteId,discipline:"wrestling",reason:"Repeat rejection is not allowed."}}),e=>e.code==="failed-precondition");
});
test("Coach cannot reject transferred historical evidence",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{action:"reject-transfer-review",athleteId,discipline:"wrestling",reason:"Coach is not authorized to reject."}}),e=>e.code==="permission-denied");
});

test("Admin acceptance preflight fails closed even if caller claims verified coverage",async()=>{
 const response=await callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{
   action:"check-transfer-acceptance",athleteId,discipline:"wrestling",
   coverageComplete:true,evidenceApproved:true,eligibleForAuto:true,
 }});
 assert.equal(response.canAccept,false);
 assert.ok(response.blockers.includes("verified-historical-coverage-manifest-required"));
 assert.ok(response.blockers.includes("verified-evidence-acceptance-chain-required"));
 assert.equal(response.coverageComplete,false);
 assert.equal(response.evidenceApproved,false);
 assert.equal(response.eligibleForAuto,false);
});
test("Coach cannot invoke historical evidence acceptance preflight",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"check-transfer-acceptance",athleteId,discipline:"wrestling",
 }}),e=>e.code==="permission-denied");
});

test("Admin receives untrusted server coverage snapshot that cannot authorize acceptance",async()=>{
 const result=await callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{
   action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling",
   coverageComplete:true,eligibleForAuto:true,
 }});
 assert.equal(result.coverageSnapshot.kind,"UNATTESTED_SERVER_DIAGNOSTIC");
 assert.equal(result.coverageSnapshot.usableForAcceptance,false);
 assert.equal(result.coverageSnapshot.coverageComplete,false);
 assert.ok(result.coverageSnapshot.scopes.some(scope=>scope.scope==="athlete-location"));
 assert.ok(result.coverageSnapshot.unresolvedBlockers.length>0);
 assert.equal(result.eligibleForAuto,false);
});
test("Coach does not receive Admin coverage snapshot",async()=>{
 const result=await callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"reconcile-server-history-scopes",athleteId,discipline:"wrestling",
 }});
 assert.equal(result.coverageSnapshot,undefined);
 assert.equal(result.eligibleForAuto,false);
});

test("Admin records durable unverified transfer coverage checkpoint without trusting caller claims",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["different-former-location"]});
 await callable.run({auth,data:{action:"open-transfer-review",athleteId,discipline:"boxing"}});
 const response=await callable.run({auth,data:{
   action:"record-transfer-coverage-checkpoint",athleteId,discipline:"boxing",
   evidenceApproved:true,coverageComplete:true,eligibleForAuto:true,
 }});
 assert.equal(response.kind,"UNVERIFIED_REVIEW_CHECKPOINT");
 assert.equal(response.eligibleForAuto,false);
 const snap=await db.doc("athletes/"+athleteId+"/historicalTransferReviews/boxing/coverageCheckpoints/"+response.checkpointId).get();
 assert.equal(snap.data().coverageComplete,false);
 assert.equal(snap.data().evidenceApproved,false);
 assert.equal(snap.data().eligibleForAuto,false);
 assert.deepEqual(snap.data().declaredPriorLocationIds,["different-former-location"]);
});
test("Coach cannot persist historical coverage checkpoint",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"record-transfer-coverage-checkpoint",athleteId,discipline:"wrestling",
 }}),e=>e.code==="permission-denied");
});
