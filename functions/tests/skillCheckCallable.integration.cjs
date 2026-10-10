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

test("Admin can inspect unverified checkpoints and see whether review revision matches",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const read=()=>callable.run({auth,data:{action:"list-transfer-coverage-checkpoints",athleteId,discipline:"boxing"}});
 const initial=await read();
 assert.ok(initial.checkpoints.length>=1);
 assert.equal(initial.checkpoints[0].currentRevision,true);
 assert.equal(initial.checkpoints[0].evidenceApproved,false);
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["changed-boxing-history"]});
 const updated=await callable.run({auth,data:{action:"refresh-transfer-review",athleteId,discipline:"boxing"}});
 assert.equal(updated.refreshed,true);
 const old=await read();
 assert.equal(old.checkpoints[0].currentRevision,false);
 assert.equal(old.eligibleForAuto,false);
});
test("Coach cannot list transfer coverage audit checkpoints",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"list-transfer-coverage-checkpoints",athleteId,discipline:"boxing",
 }}),e=>e.code==="permission-denied");
});

test("Admin creates server-sourced evidence manifest with precise provenance, without approving it",async()=>{
 const {Timestamp}=require("firebase-admin/firestore");
 const id="test-manifest-boxing";
 await db.doc("practiceSessions/"+id).set({coachUid:"test-coach",locationId:"test-location",discipline:"boxing",sessionDateKey:"2026-10-04"});
 await db.doc("attendance_sessions/"+id).set({practiceId:id,discipline:"boxing",status:"finalized",finalized:true,presentIds:[athleteId]});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId).set({practiceId:id,athleteId,discipline:"boxing",attendance:{status:"present"}});
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId+"/verifiedSkills/boxing__jab_system").set({
   discipline:"boxing",familyId:"jab_system",state:"LEARNED",coachUid:"test-coach",
   verifiedAt:Timestamp.fromDate(new Date("2026-10-04T18:00:00Z")),
 });
 const auth={uid:"test-admin-transfer",token:{}};
 const result=await callable.run({auth,data:{
   action:"build-verified-evidence-manifest",athleteId,discipline:"boxing",
   evidenceApproved:true,coverageComplete:true,eligibleForAuto:true,
 }});
 assert.equal(result.recordCount,1);
 assert.equal(result.eligibleForAuto,false);
 const snap=await db.doc("athletes/"+athleteId+"/historicalTransferReviews/boxing/evidenceManifests/"+result.manifestId).get();
 assert.equal(snap.data().kind,"SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST");
 assert.equal(snap.data().evidenceApproved,false);
 assert.equal(snap.data().coverageComplete,false);
 assert.equal(snap.data().records.length,1);
 assert.ok(snap.data().checkedScopes.some(scope=>scope.scope==="athlete-location"
   && scope.status==="BOUNDED_SCAN_EXHAUSTED" && scope.exhausted===true));
 assert.ok(snap.data().checkedScopes.every(scope=>scope.status!=="VERIFIED_COMPLETE"));
 assert.equal(snap.data().coverageComplete,false);
 assert.equal(snap.data().records[0].skillEvidencePath,"practiceSessions/"+id+"/athletes/"+athleteId+"/verifiedSkills/boxing__jab_system");
 assert.equal(snap.data().records[0].attendancePath,"attendance_sessions/"+id);
 assert.equal(snap.data().records[0].athleteMemoryPath,"practiceSessions/"+id+"/athletes/"+athleteId);
 const verified=await callable.run({auth,data:{action:"verify-evidence-manifest",athleteId,discipline:"boxing",manifestId:result.manifestId}});
 assert.equal(verified.sourceRecordsValid,true);
 assert.equal(verified.reviewCurrent,true);
 assert.equal(verified.historicalCoverageVerified,false);
 assert.equal(verified.acceptanceReady,false);
 assert.equal(verified.evidenceApproved,false);
 assert.equal(verified.eligibleForAuto,false);
 await db.doc("practiceSessions/"+id+"/athletes/"+athleteId+"/verifiedSkills/boxing__jab_system").update({state:"MASTERED"});
 const changed=await callable.run({auth,data:{action:"verify-evidence-manifest",athleteId,discipline:"boxing",manifestId:result.manifestId}});
 assert.equal(changed.sourceRecordsValid,false);
 assert.ok(changed.records[0].blockers.includes("skill-evidence-changed"));
 await db.doc("practiceSessions/"+id).update({locationId:"unrelated-location"});
 const relocated=await callable.run({auth,data:{action:"verify-evidence-manifest",athleteId,discipline:"boxing",manifestId:result.manifestId}});
 assert.equal(relocated.sourceRecordsValid,false);
 assert.ok(relocated.records[0].blockers.includes("practice-scope-changed"));
 assert.equal(relocated.acceptanceReady,false);
 assert.equal(relocated.eligibleForAuto,false);
});
test("Coach is denied durable evidence manifest creation",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"build-verified-evidence-manifest",athleteId,discipline:"boxing",
 }}),e=>e.code==="permission-denied");
});

test("Coach cannot verify saved transfer manifests",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"verify-evidence-manifest",athleteId,discipline:"boxing",manifestId:"test-manifest",
 }}),e=>e.code==="permission-denied");
});

test("Admin scope scan resumes after cursor and never claims history completeness",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const ids=Array.from({length:52},(_,i)=>"test-page-scan-"+String(i).padStart(3,"0"));
 const batch=db.batch();
 for(const id of ids) batch.set(db.doc("practiceSessions/"+id),{
   coachUid:"test-coach",locationId:"scan-only-location",discipline:"wrestling",sessionDateKey:"2026-10-01"
 });
 await batch.commit();
 await db.doc("athletes/"+athleteId).update({previousLocationIds:["scan-only-location"]});
 const scan=cursor=>callable.run({auth,data:{
   action:"scan-history-scope-page",athleteId,discipline:"wrestling",
   scope:"prior-location:scan-only-location",...(cursor?{cursor}:{}),
 }});
 const first=await scan();
 assert.equal(first.scopeExhausted,false);
 assert.equal(first.nextCursor,ids[49]);
 assert.equal(first.eligibleForAuto,false);
 const second=await scan(first.nextCursor);
 assert.equal(second.scopeExhausted,true);
 assert.equal(second.nextCursor,null);
 assert.equal(second.eligibleForAuto,false);
 const batched=await callable.run({auth,data:{
   action:"scan-history-scope-page",athleteId,discipline:"wrestling",
   scope:"prior-location:scan-only-location",pages:2,
 }});
 assert.equal(batched.scannedPages,2);
 assert.equal(batched.scannedCandidates,52);
 assert.equal(batched.scopeExhausted,true);
 assert.equal(batched.nextCursor,null);
 assert.equal(batched.coverageComplete,false);
 assert.equal(batched.eligibleForAuto,false);
 await assert.rejects(callable.run({auth,data:{
   action:"scan-history-scope-page",athleteId,discipline:"wrestling",
   scope:"prior-location:scan-only-location",pages:4,
 }}),e=>e.code==="invalid-argument");
});
test("Coach and undeclared prior locations cannot use the resumable scan",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"scan-history-scope-page",athleteId,discipline:"wrestling",
   scope:"athlete-location",
 }}),e=>e.code==="permission-denied");
 await assert.rejects(callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{
   action:"scan-history-scope-page",athleteId,discipline:"wrestling",
   scope:"prior-location:unknown-location",
 }}),e=>e.code==="permission-denied");
});

test("Integrated historical review reports every scope without asserting full athlete coverage",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const result=await callable.run({auth,data:{
   action:"evaluate-integrated-history-coverage",athleteId,discipline:"wrestling",
   coverageComplete:true,evidenceApproved:true,eligibleForAuto:true,
 }});
 assert.equal(result.kind,"INTEGRATED_HISTORY_COVERAGE_REVIEW");
 assert.ok(result.requiredScopes.some(s=>s.scope==="athlete-location"));
 assert.ok(result.requiredScopes.some(s=>s.scope==="prior-location:scan-only-location"));
 assert.equal(result.transferHistoryAttested,false);
 assert.equal(result.sourceEvidenceAccepted,false);
 assert.equal(result.coverageComplete,false);
 assert.equal(result.eligibleForAuto,false);
});
test("Coaches cannot run integrated historical coverage review",async()=>{
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"evaluate-integrated-history-coverage",athleteId,discipline:"wrestling",
 }}),e=>e.code==="permission-denied");
});

test("History attestation assessment rejects incomplete evidence even with saved manifests",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const result=await callable.run({auth,data:{
   action:"assess-history-attestation",athleteId,discipline:"boxing",
   coverageComplete:true,evidenceApproved:true,eligibleForAuto:true,
 }});
 assert.equal(result.kind,"HISTORY_ATTESTATION_ASSESSMENT");
 assert.equal(result.attested,false);
 assert.equal(result.coverageComplete,false);
 assert.equal(result.evidenceApproved,false);
 assert.equal(result.eligibleForAuto,false);
 assert.ok(result.blockers.includes("independent-full-history-attestation-required"));
 assert.ok(result.blockers.includes("current-source-reverification-required"));
});
test("Unapproved history never produces a current athlete skill-state preview",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const result=await callable.run({auth,data:{
   action:"preview-accepted-skill-state",athleteId,discipline:"wrestling",
   eligibleForAuto:true,evidenceApproved:true,
 }});
 assert.deepEqual(result.skillStates,[]);
 assert.ok(result.unresolvedFamilies.includes("double_leg"));
 assert.equal(result.eligibleForAuto,false);
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"preview-accepted-skill-state",athleteId,discipline:"wrestling",
 }}),e=>e.code==="permission-denied");
});

test("end-to-end historical intake, scan, manifest, recheck, and attestation remain fail-closed",async()=>{
 const {Timestamp}=require("firebase-admin/firestore");
 const id="F8_INTEGRATED_E2E";
 const practiceId="test-e2e-attestation-practice";
 const auth={uid:"test-admin-transfer",token:{}};
 await db.doc("athletes/"+id).set({locationId:"test-location",academyId:"e2e-test-academy",previousLocationIds:["e2e-former-location"]});
 await db.doc("practiceSessions/"+practiceId).set({
   coachUid:"former-coach",locationId:"e2e-former-location",
   discipline:"wrestling",sessionDateKey:"2026-10-03",
 });
 await db.doc("attendance_sessions/"+practiceId).set({
   practiceId,discipline:"wrestling",status:"finalized",finalized:true,presentIds:[id],
 });
 await db.doc("practiceSessions/"+practiceId+"/athletes/"+id).set({
   practiceId,athleteId:id,discipline:"wrestling",attendance:{status:"present"},
 });
 await db.doc("practiceSessions/"+practiceId+"/athletes/"+id+"/verifiedSkills/wrestling__double_leg").set({
   discipline:"wrestling",familyId:"double_leg",state:"LEARNED",
   coachUid:"former-coach",verifiedAt:Timestamp.fromDate(new Date("2026-10-03T18:00:00Z")),
 });
 const invoke=(action,extra={})=>callable.run({auth,data:{action,athleteId:id,discipline:"wrestling",...extra}});
 const opened=await invoke("open-transfer-review");
 assert.equal(opened.created,true);
 const scan=await invoke("scan-history-scope-page",{scope:"prior-location:e2e-former-location"});
 assert.equal(scan.scopeExhausted,true);
 assert.equal(scan.practices.length,1);
 const manifest=await invoke("build-verified-evidence-manifest");
 assert.equal(manifest.recordCount,1);
 assert.ok(manifest.blockers.includes("historical-transfer-coverage-unverified"));
 assert.ok(manifest.blockers.includes("current-skill-state-unresolved"));
 const sources=await invoke("verify-evidence-manifest",{manifestId:manifest.manifestId,recordVerification:true});
 assert.equal(sources.sourceRecordsValid,true);
 assert.ok(sources.verificationReceiptId);
 const receipt=await db.doc("athletes/"+id+"/historicalTransferReviews/wrestling/sourceVerificationReceipts/"+sources.verificationReceiptId).get();
 assert.equal(receipt.data().sourceRecordsValid,true);
 assert.equal(receipt.data().evidenceApproved,false);
 assert.equal(sources.acceptanceReady,false);
 const certified=await invoke("certify-bounded-history-snapshot",{manifestId:manifest.manifestId});
 assert.equal(certified.certificateIssued,true,JSON.stringify(certified.blockers));
 assert.equal(certified.observedEvidenceCount,1);
 const certificate=await db.doc("athletes/"+id+"/historicalTransferReviews/wrestling/coverageCertificates/"+manifest.manifestId).get();
 assert.equal(certificate.data().kind,"SERVER_CERTIFIED_FULL_HISTORY");
 assert.equal(certificate.data().evidenceApproved,false);
 const addedPath="practiceSessions/"+practiceId+"/athletes/"+id+"/verifiedSkills/wrestling__single_leg";
 await db.doc(addedPath).set({
   discipline:"wrestling",familyId:"single_leg",state:"LEARNED",
   coachUid:"former-coach",verifiedAt:Timestamp.fromDate(new Date("2026-10-03T19:00:00Z")),
 });
 const expanded=await invoke("commit-transfer-acceptance",{
   manifestId:manifest.manifestId,verificationReceiptId:sources.verificationReceiptId,
 });
 assert.equal(expanded.accepted,false);
 assert.ok(expanded.blockers.includes("certified-inventory-changed"));
 await db.doc(addedPath).delete();
 const acceptance=await invoke("commit-transfer-acceptance",{
   manifestId:manifest.manifestId,verificationReceiptId:sources.verificationReceiptId,
 });
 assert.equal(acceptance.accepted,true,JSON.stringify(acceptance.blockers));
 assert.equal(acceptance.evidenceApproved,true);
 assert.equal(acceptance.eligibleForAuto,false);
 const acceptedReview=await db.doc("athletes/"+id+"/historicalTransferReviews/wrestling").get();
 assert.equal(acceptedReview.data().status,"ACCEPTED_HISTORICAL_EVIDENCE");
 const audit=await acceptedReview.ref.collection("acceptanceDecisions").doc(manifest.manifestId).get();
 assert.equal(audit.data().kind,"HISTORICAL_EVIDENCE_ACCEPTANCE");
 assert.equal(audit.data().xpAwarded,false);
 const preview=await invoke("preview-accepted-skill-state");
 assert.equal(preview.blockers.length,0,JSON.stringify(preview.blockers));
 assert.deepEqual(preview.skillStates.map(item=>({familyId:item.familyId,state:item.state})),
   [{familyId:"double_leg",state:"LEARNED"}]);
 assert.ok(preview.unresolvedFamilies.includes("single_leg"));
 assert.equal(preview.eligibleForAuto,false);
 const group=await invoke("preview-group-lessons",{
   athleteIds:[id],familyIds:["double_leg","single_leg"],
 });
 assert.equal(group.ready,true,JSON.stringify(group.blockers));
 assert.equal(group.lessonCandidates.find(item=>item.familyId==="double_leg").members[0].track,"PRACTICE");
 assert.equal(group.lessonCandidates.find(item=>item.familyId==="single_leg").members[0].track,"INTRODUCE");
 assert.equal(group.eligibleForAuto,false);
 assert.equal(group.supervisedSuggestion.ready,true);
 assert.equal(group.supervisedSuggestion.selection.familyId,"single_leg");
 assert.equal(group.supervisedSuggestion.coachApprovalRequired,true);
 assert.equal(group.supervisedSuggestion.eligibleForAuto,false);
 const tied=await invoke("preview-group-lessons",{
   athleteIds:[id],familyIds:["single_leg","high_crotch"],
 });
 assert.equal(tied.ready,true);
 assert.equal(tied.supervisedSuggestion.ready,false);
 assert.deepEqual(tied.supervisedSuggestion.blockers,["multiple-equivalent-lessons"]);
 const generated=await invoke("create-recommended-group-lesson-draft",{
   lessonId:"recommended-e2e-lesson",athleteIds:[id],
   familyIds:["double_leg","single_leg"],familyId:"double_leg",
   tracks:[{athleteId:id,track:"EXTEND"}],
 });
 assert.equal(generated.status,"DRAFT");
 assert.deepEqual(generated.tracks,[{athleteId:id,track:"PRACTICE"}]);
 const generatedRecord=await db.doc("coachLessonPlans/recommended-e2e-lesson").get();
 assert.equal(generatedRecord.data().source,"ACCEPTED_SKILL_RECOMMENDATION");
 assert.equal(generatedRecord.data().eligibleForAuto,false);
 // Full recommended lesson: review -> confirm -> attach -> teach -> recover.
 const reviewed=await invoke("save-group-lesson-draft",{
   lessonId:"recommended-e2e-lesson",familyId:"double_leg",athleteIds:[id],
   tracks:[{athleteId:id,track:"EXTEND"}],
 });
 assert.equal(reviewed.status,"DRAFT");
 const approvedPlan=await invoke("confirm-group-lesson-draft",{
   lessonId:"recommended-e2e-lesson",familyId:"double_leg",athleteIds:[id],
   tracks:[{athleteId:id,track:"EXTEND"}],
 });
 assert.equal(approvedPlan.status,"COACH_CONFIRMED");
 const deliveryPractice="test-e2e-coach-lesson-practice";
 await db.doc("practiceSessions/"+deliveryPractice).set({
   coachUid:"test-admin-transfer",locationId:"test-location",
   discipline:"wrestling",sessionDateKey:"2026-10-09",
 });
 const linked=await invoke("attach-group-lesson-to-practice",{
   lessonId:"recommended-e2e-lesson",practiceId:deliveryPractice,
 });
 assert.equal(linked.deliveryStatus,"READY_FOR_PRACTICE");
 const recorded=await invoke("record-group-lesson-delivery",{
   lessonId:"recommended-e2e-lesson",practiceId:deliveryPractice,
   deliveredAthleteIds:[id],coachNote:"Coach observed positional entries.",
 });
 assert.equal(recorded.deliveryStatus,"RECORDED");
 assert.equal(recorded.xpAwarded,false);
 assert.equal(recorded.skillVerified,false);
 const recovered=await invoke("get-group-lesson-plan",{
   athleteId:"RESUME",lessonId:"recommended-e2e-lesson",
 });
 assert.equal(recovered.deliveryStatus,"RECORDED");
 assert.equal(recovered.tracks[0].track,"EXTEND");
 assert.deepEqual(recovered.deliveredAthleteIds,[id]);
 assert.equal(recovered.eligibleForAuto,false);
 await assert.rejects(invoke("record-group-lesson-delivery",{
   lessonId:"recommended-e2e-lesson",practiceId:deliveryPractice,deliveredAthleteIds:[id],
 }),error=>error.code==="failed-precondition");
 await assert.rejects(invoke("create-recommended-group-lesson-draft",{
   lessonId:"recommended-e2e-lesson",athleteIds:[id],
   familyIds:["double_leg"],familyId:"double_leg",
 }),e=>e.code==="already-exists");
 const coachPreview=await callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"preview-group-lessons",athleteIds:[id],discipline:"wrestling",
   familyIds:["double_leg"],
 }});
 assert.equal(coachPreview.ready,true);
 assert.equal(coachPreview.eligibleForAuto,false);
 const blockedGroup=await invoke("preview-group-lessons",{
   athleteIds:[id,"F8_AUTH_SMOKE"],familyIds:["double_leg"],
 });
 assert.equal(blockedGroup.ready,false);
 assert.equal(blockedGroup.lessonCandidates.length,0);
 const duplicate=await invoke("commit-transfer-acceptance",{
   manifestId:manifest.manifestId,verificationReceiptId:sources.verificationReceiptId,
 });
 assert.equal(duplicate.accepted,false);
 assert.ok(duplicate.blockers.includes("review-not-pending"));
 const assessed=await invoke("assess-history-attestation");
 assert.equal(assessed.attested,false);
 assert.equal(assessed.coverageComplete,false);
 assert.equal(assessed.eligibleForAuto,false);
 assert.ok(assessed.blockers.includes("independent-full-history-attestation-required"));
 const states=await invoke("preview-accepted-skill-state");
 assert.equal(states.skillStates[0].state,"LEARNED");
 await db.doc("practiceSessions/"+practiceId).update({sessionDateKey:"2026-10-02"});
 const staleApproval=await invoke("commit-transfer-acceptance",{
   manifestId:manifest.manifestId,verificationReceiptId:sources.verificationReceiptId,
 });
 assert.equal(staleApproval.accepted,false);
 assert.ok(staleApproval.blockers.some(blocker=>blocker.startsWith("atomic-source-recheck-failed:")));
 const changed=await invoke("verify-evidence-manifest",{manifestId:manifest.manifestId});
 assert.equal(changed.sourceRecordsValid,false);
 assert.ok(changed.records[0].blockers.includes("practice-changed"));
 assert.equal(changed.eligibleForAuto,false);
});

test("Transactional historical acceptance denies missing certification and spoofed approvals",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const attempt=await callable.run({auth,data:{
   action:"commit-transfer-acceptance",athleteId,discipline:"wrestling",
   manifestId:"unknown-manifest",verificationReceiptId:"unknown-receipt",
   evidenceApproved:true,coverageComplete:true,eligibleForAuto:true,
 }});
 assert.equal(attempt.kind,"TRANSFER_ACCEPTANCE_TRANSACTION");
 assert.equal(attempt.accepted,false);
 assert.ok(attempt.blockers.includes("independent-full-history-certification-required"));
 assert.ok(attempt.blockers.includes("manifest-source-count-invalid-for-atomic-recheck"));
 assert.equal(attempt.eligibleForAuto,false);
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"commit-transfer-acceptance",athleteId,discipline:"wrestling",
   manifestId:"unknown-manifest",verificationReceiptId:"unknown-receipt",
 }}),e=>e.code==="permission-denied");
});

test("Certification preflight cannot manufacture full-history approval",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const result=await callable.run({auth,data:{
   action:"certify-history-coverage",athleteId,discipline:"wrestling",
   manifestId:"missing-certificate-manifest",
   coverageComplete:true,evidenceApproved:true,eligibleForAuto:true,
 }});
 assert.equal(result.kind,"HISTORY_CERTIFICATION_PREFLIGHT");
 assert.equal(result.certificateIssued,false);
 assert.ok(result.blockers.includes("manifest-not-current"));
 assert.ok(result.blockers.includes("independent-unbounded-scope-reconciliation-required"));
 assert.equal(result.coverageComplete,false);
 assert.equal(result.eligibleForAuto,false);
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"certify-history-coverage",athleteId,discipline:"wrestling",
   manifestId:"missing-certificate-manifest",
 }}),e=>e.code==="permission-denied");
});

test("Server-owned traversal persists two pages and cannot accept a forged cursor",async()=>{
 const id="F8_SERVER_TRAVERSAL";
 const location="traversal-location-only";
 const auth={uid:"test-admin-transfer",token:{}};
 await db.doc("athletes/"+id).set({locationId:"test-location",previousLocationIds:[location]});
 for(let i=0;i<53;i++) {
   await db.doc("practiceSessions/traversal-"+String(i).padStart(3,"0")).set({
     locationId:location,discipline:"wrestling",sessionDateKey:"2026-10-01",
   });
 }
 const invoke=(extra={})=>callable.run({auth,data:{
   action:"advance-server-history-traversal",athleteId:id,discipline:"wrestling",
   scope:"prior-location:"+location,...extra,
 }});
 await assert.rejects(invoke({cursor:"traversal-052"}),e=>e.code==="failed-precondition");
 await callable.run({auth,data:{action:"open-transfer-review",athleteId:id,discipline:"wrestling"}});
 const first=await invoke({cursor:"traversal-052",scopeExhausted:true,coverageComplete:true});
 assert.equal(first.scannedCandidates,50);
 assert.equal(first.scopeExhausted,false);
 const second=await invoke({cursor:"traversal-052"});
 assert.equal(second.scannedCandidates,53);
 assert.equal(second.scopeExhausted,true);
 const third=await invoke();
 assert.equal(third.alreadyExhausted,true);
 const saved=await db.doc("athletes/"+id+"/historicalTransferReviews/wrestling/scopeTraversals/prior-location_3Atraversal-location-only").get();
 assert.equal(saved.data().pagesRead,2);
 assert.equal(saved.data().coverageComplete,false);
 const pages=await saved.ref.collection("pages").get();
 assert.equal(pages.size,2);
 assert.equal(pages.docs.reduce((total,page)=>total+page.data().candidateIds.length,0),53);
 assert.equal(second.eligibleForAuto,false);
 const verified=await callable.run({auth,data:{
   action:"verify-server-history-inventory",athleteId:id,discipline:"wrestling",
   scope:"prior-location:"+location,
 }});
 assert.equal(verified.replayMatched,true);
 assert.equal(verified.certificateIssued,false);
 assert.equal(verified.eligibleForAuto,false);
 await db.doc("practiceSessions/traversal-000").update({locationId:"relocated-after-scan"});
 const changed=await callable.run({auth,data:{
   action:"verify-server-history-inventory",athleteId:id,discipline:"wrestling",
   scope:"prior-location:"+location,
 }});
 assert.equal(changed.replayMatched,false);
 assert.ok(changed.blockers.includes("historical-page-changed:1"));
 assert.equal(changed.coverageComplete,false);
});

test("Atomic snapshot certificate refuses missing manifests and forged approval",async()=>{
 const auth={uid:"test-admin-transfer",token:{}};
 const result=await callable.run({auth,data:{
   action:"certify-bounded-history-snapshot",athleteId,discipline:"wrestling",
   manifestId:"missing-manifest",coverageComplete:true,evidenceApproved:true,
 }});
 assert.equal(result.certificateIssued,false);
 assert.ok(result.blockers.includes("manifest-invalid"));
 assert.equal(result.evidenceApproved,false);
 assert.equal(result.eligibleForAuto,false);
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"certify-bounded-history-snapshot",athleteId,discipline:"wrestling",
   manifestId:"missing-manifest",
 }}),e=>e.code==="permission-denied");
});

test("Coach group preview cannot read another athlete outside assigned location",async()=>{
 const outside="F8_COACH_OUTSIDE";
 await db.doc("athletes/"+outside).set({locationId:"coach-outside-location"});
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
   action:"preview-group-lessons",athleteIds:[athleteId,outside],
   discipline:"wrestling",familyIds:["double_leg"],
 }}),e=>e.code==="permission-denied");
});

test("Coach can revise and confirm group lesson once without XP or AUTO",async()=>{
 const auth={uid:"test-coach",token:{}};
 const params={athleteId,discipline:"wrestling",lessonId:"coach-reviewed-sample",
  familyId:"double_leg",athleteIds:[athleteId],
  tracks:[{athleteId,track:"INTRODUCE"}]};
 const invoke=(action,overrides={})=>callable.run({auth,data:{action,...params,...overrides}});
 const draft=await invoke("save-group-lesson-draft");
 assert.equal(draft.status,"DRAFT");
 const updated=await invoke("save-group-lesson-draft",{tracks:[{athleteId,track:"PRACTICE"}]});
 assert.equal(updated.status,"DRAFT");
 await assert.rejects(invoke("confirm-group-lesson-draft"),e=>e.code==="failed-precondition");
 const confirmed=await invoke("confirm-group-lesson-draft",{tracks:[{athleteId,track:"PRACTICE"}]});
 assert.equal(confirmed.status,"COACH_CONFIRMED");
 const resumed=await invoke("get-group-lesson-plan",{athleteId:"RESUME",tracks:[]});
 assert.equal(resumed.status,"COACH_CONFIRMED");
 assert.deepEqual(resumed.athleteIds,[athleteId]);
 assert.equal(resumed.tracks[0].track,"PRACTICE");
 await assert.rejects(callable.run({auth:{uid:"test-admin-transfer",token:{}},data:{action:"get-group-lesson-plan",athleteId:"RESUME",discipline:"wrestling",lessonId:"coach-reviewed-sample"}}),e=>e.code==="permission-denied");
 assert.equal(confirmed.lessonExecuted,false);
 assert.equal(confirmed.xpAwarded,false);
 assert.equal(confirmed.eligibleForAuto,false);
 const stored=await db.doc("coachLessonPlans/coach-reviewed-sample").get();
 assert.equal(stored.data().status,"COACH_CONFIRMED");
 assert.equal(stored.data().eligibleForAuto,false);
 await db.doc("practiceSessions/coach-lesson-practice").set({
   coachUid:"test-coach",locationId:"test-location",discipline:"wrestling",
   sessionDateKey:"2026-10-09",
 });
 const attached=await invoke("attach-group-lesson-to-practice",{
   tracks:[{athleteId,track:"PRACTICE"}],practiceId:"coach-lesson-practice",
 });
 assert.equal(attached.deliveryStatus,"READY_FOR_PRACTICE");
 const delivered=await invoke("record-group-lesson-delivery",{
   practiceId:"coach-lesson-practice",deliveredAthleteIds:[athleteId],
   coachNote:"Drilled entries and positioning.",
 });
 assert.equal(delivered.deliveryStatus,"RECORDED");
 assert.equal(delivered.xpAwarded,false);
 assert.equal(delivered.skillVerified,false);
 const practicePlan=await db.doc("coachLessonPlans/coach-reviewed-sample").get();
 assert.deepEqual(practicePlan.data().deliveredAthleteIds,[athleteId]);
 await assert.rejects(invoke("record-group-lesson-delivery",{
   practiceId:"coach-lesson-practice",deliveredAthleteIds:[athleteId],
 }),e=>e.code==="failed-precondition");
 await assert.rejects(invoke("confirm-group-lesson-draft",{tracks:[{athleteId,track:"PRACTICE"}]}),e=>e.code==="failed-precondition");
 await assert.rejects(invoke("save-group-lesson-draft"),e=>e.code==="failed-precondition");
});
test("Coach cannot save lesson for athlete outside assigned scope",async()=>{
 await db.doc("athletes/F8_PLAN_OUTSIDE").set({locationId:"different-coach-location"});
 await assert.rejects(callable.run({auth:{uid:"test-coach",token:{}},data:{
  action:"save-group-lesson-draft",athleteId,discipline:"wrestling",
  lessonId:"unauthorized-roster",familyId:"double_leg",
  athleteIds:[athleteId,"F8_PLAN_OUTSIDE"],
  tracks:[{athleteId,track:"PRACTICE"},{athleteId:"F8_PLAN_OUTSIDE",track:"INTRODUCE"}],
 }}),e=>e.code==="permission-denied");
});
