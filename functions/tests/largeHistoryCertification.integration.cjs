const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getFirestore,Timestamp}=require("firebase-admin/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.GCLOUD_PROJECT?.startsWith("demo-"))
  throw Error("Emulator-only test: refusing production Firestore");
if(!getApps().length) initializeApp({projectId:process.env.GCLOUD_PROJECT});
const db=getFirestore();
const certification=require("../lib/modules/resumableHistoricalCertificationCall").resumableHistoricalCertificationCall;
const skillCheck=require("../lib/modules/skillCheckCoachCall").skillCheckCoachCall;
const suffix=String(process.pid);
const athleteId="F8_LARGE_HISTORY_"+suffix;
const adminId="large-history-admin-"+suffix;
const coachId="large-history-coach-"+suffix;
const auth={uid:adminId,token:{}};
const invoke=(action,extra={})=>certification.run({auth,data:{action,athleteId,discipline:"wrestling",...extra}});

test("large history resumes across hash-chained inventory and independent reconciliation",async()=>{
  const priorLocations=Array.from({length:11},(_,index)=>"large-prior-"+suffix+"-"+index);
  const crossLocation="large-cross-"+suffix;
  await Promise.all([
    db.doc("staff/"+adminId).set({role:"admin",status:"active"}),
    db.doc("staff/"+coachId).set({role:"coach",status:"active",locationIds:["large-current-"+suffix]}),
    db.doc("athletes/"+athleteId).set({locationId:"large-current-"+suffix,
      academyId:"large-academy-"+suffix,previousLocationIds:priorLocations,
      primaryDiscipline:"wrestling",disciplineIds:["wrestling"]}),
    db.doc("athletes/"+athleteId+"/historyRevisions/wrestling").set({revision:1}),
    db.doc("athletes/"+athleteId+"/historicalTransferReviews/wrestling").set({
      status:"PENDING_MANAGEMENT_REVIEW",revision:1,declaredPriorLocationIds:priorLocations,
      evidenceApproved:false,coverageComplete:false,eligibleForAuto:false}),
    db.doc("athleteCrossTrainingAssignments/large-history-"+suffix).set({athleteId,
      homeLocationId:"large-current-"+suffix,hostLocationId:crossLocation,
      disciplineIds:["wrestling"],status:"inactive"}),
  ]);
  const batch=db.batch();
  for(let index=0;index<55;index++){
    const practiceId="large-history-"+suffix+"-"+String(index).padStart(3,"0");
    const locationId=index%13===12?crossLocation:index%12===0?"large-current-"+suffix:priorLocations[index%11];
    batch.set(db.doc("practiceSessions/"+practiceId),{practiceId,locationId,discipline:"wrestling",
      sessionDateKey:"2026-09-"+String(index%28+1).padStart(2,"0"),coachUid:coachId});
    batch.set(db.doc("attendance_sessions/"+practiceId),{practiceId,locationId,discipline:"wrestling",
      status:"finalized",finalized:true,presentIds:[athleteId]});
    batch.set(db.doc("practiceSessions/"+practiceId+"/athletes/"+athleteId),{
      practiceId,athleteId,discipline:"wrestling",attendance:{status:"present"}});
    batch.set(db.doc("practiceSessions/"+practiceId+"/athletes/"+athleteId+
      "/verifiedSkills/wrestling__family_"+index),{discipline:"wrestling",familyId:"double_leg",
      state:index===54?"APPLIED":"LEARNED",coachUid:coachId,
      verifiedAt:Timestamp.fromMillis(Date.UTC(2026,8,1,18,0,0)+index*60_000)});
  }
  await batch.commit();
  await assert.rejects(certification.run({auth:{uid:coachId,token:{}},data:{
    action:"open",athleteId,discipline:"wrestling"}}),error=>error.code==="permission-denied");

  const stale=await invoke("open");
  const first=await invoke("advance-inventory",{runId:stale.runId,expectedSequence:0});
  assert.equal(first.exhausted,false);
  const retried=await invoke("advance-inventory",{runId:stale.runId,expectedSequence:0});
  assert.equal(retried.idempotent,true);
  assert.equal(retried.pageHash,first.pageHash);
  assert.equal(retried.sequence,0);
  await db.doc("athletes/"+athleteId+"/historyRevisions/wrestling").update({revision:2});
  await assert.rejects(invoke("advance-inventory",{runId:stale.runId,expectedSequence:1}),
    error=>error.code==="failed-precondition");

  const opened=await invoke("open");
  let inventoryPages=0;
  for(;;){
    const page=await invoke("advance-inventory",{runId:opened.runId,expectedSequence:inventoryPages});
    assert.equal(page.blocked,false,JSON.stringify(page.blockers));
    inventoryPages++;
    if(page.exhausted) break;
  }
  assert.ok(inventoryPages>5,"more than fifty practices must require multiple pages");
  await assert.rejects(invoke("finalize",{runId:opened.runId}),error=>error.code==="failed-precondition");
  await invoke("begin-reconciliation",{runId:opened.runId});
  let reconciliationPages=0;
  for(;;){
    const page=await invoke("advance-reconciliation",{runId:opened.runId,expectedSequence:reconciliationPages});
    assert.equal(page.blocked,false,JSON.stringify(page.blockers));
    reconciliationPages++;
    if(page.exhausted) break;
  }
  assert.equal(reconciliationPages,inventoryPages);
  const unindexedPracticeId="legacy-memory-only-"+suffix;
  const unindexedMemory=db.doc("practiceSessions/"+unindexedPracticeId+"/athletes/"+athleteId);
  await unindexedMemory.set({practiceId:unindexedPracticeId,athleteId,discipline:"wrestling",
    attendance:{status:"present"}});
  await assert.rejects(invoke("finalize",{runId:opened.runId}),error=>
    error.code==="failed-precondition"&&String(error.message).includes("attendance-index-incomplete"));
  await unindexedMemory.delete();
  const finalized=await invoke("finalize",{runId:opened.runId});
  assert.equal(finalized.coverageComplete,true);
  assert.equal(finalized.evidenceApproved,false);
  assert.equal(finalized.verifiedPracticeCount,55);
  assert.equal(finalized.verifiedEvidenceCount,55);
  const finalizedRetry=await invoke("finalize",{runId:opened.runId});
  assert.equal(finalizedRetry.idempotent,true);
  const certificate=await db.doc("athletes/"+athleteId+"/largeHistoryCertificates/"+opened.runId).get();
  assert.equal(certificate.data().kind,"SERVER_CERTIFIED_LARGE_HISTORY_COVERAGE");
  assert.equal(certificate.data().skillStates[0].state,"APPLIED");
  const reviewRef=db.doc("athletes/"+athleteId+"/historicalTransferReviews/wrestling");
  await reviewRef.update({revision:2});
  await assert.rejects(invoke("accept",{runId:opened.runId}),error=>error.code==="failed-precondition");
  await reviewRef.update({revision:1});
  const accepted=await invoke("accept",{runId:opened.runId});
  assert.equal(accepted.evidenceApproved,true);
  assert.equal(accepted.eligibleForAuto,false);
  const acceptedRetry=await invoke("accept",{runId:opened.runId});
  assert.equal(acceptedRetry.accepted,true);
  const preview=await skillCheck.run({auth,data:{action:"preview-accepted-skill-state",athleteId,
    discipline:"wrestling"}});
  assert.equal(preview.blockers.length,0,JSON.stringify(preview.blockers));
  assert.equal(preview.skillStates[0].state,"APPLIED");
  const group=await skillCheck.run({auth:{uid:coachId,token:{}},data:{action:"preview-group-lessons",
    athleteIds:[athleteId],discipline:"wrestling",familyIds:["double_leg"]}});
  assert.equal(group.ready,true,JSON.stringify(group.blockers));
  assert.equal(group.eligibleForAuto,false);
  await invoke("revoke",{runId:opened.runId,reason:"Certification revoked during adversarial integration verification."});
  const revoked=await skillCheck.run({auth,data:{action:"preview-accepted-skill-state",athleteId,
    discipline:"wrestling"}});
  assert.deepEqual(revoked.skillStates,[]);
  assert.ok(revoked.blockers.includes("large-history-authority-invalid-or-stale"));
});
