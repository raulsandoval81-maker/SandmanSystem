import {pathToFileURL} from "node:url";

const iso=index=>new Date(Date.UTC(2026,8,1,18,0)+index*60_000).toISOString();
const doc=(path,data)=>({path,data:{...data,synthetic:true,fixtureOwner:"batch-e-certification"}});

export function buildSyntheticCertificationFixtures() {
  const athleteId="batch-e-large-history";
  const current="batch-e-current";
  const prior=Array.from({length:11},(_,index)=>`batch-e-prior-${index}`);
  const cross="batch-e-cross-host";
  const documents=[
    doc(`athletes/${athleteId}`,{locationId:current,academyId:"batch-e-academy",
      previousLocationIds:prior,disciplineIds:["wrestling"]}),
    doc(`athletes/${athleteId}/historyRevisions/wrestling`,{revision:1}),
    doc(`athletes/${athleteId}/historicalTransferReviews/wrestling`,{
      status:"PENDING_MANAGEMENT_REVIEW",revision:1,evidenceApproved:false,
      coverageComplete:false,eligibleForAuto:false}),
    doc("athleteCrossTrainingAssignments/batch-e-cross-training",{athleteId,
      homeLocationId:current,hostLocationId:cross,disciplineIds:["wrestling"],status:"active"}),
  ];
  for(let index=0;index<55;index++){
    const practiceId=`batch-e-large-${String(index).padStart(3,"0")}`;
    const locationId=index%13===12?cross:index%12===0?current:prior[index%11];
    documents.push(
      doc(`practiceSessions/${practiceId}`,{practiceId,locationId,discipline:"wrestling",
        sessionDateKey:`2026-09-${String(index%28+1).padStart(2,"0")}`}),
      doc(`attendance_sessions/${practiceId}`,{practiceId,locationId,discipline:"wrestling",
        status:"finalized",finalized:true,presentIds:[athleteId]}),
      doc(`practiceSessions/${practiceId}/athletes/${athleteId}`,{practiceId,athleteId,
        discipline:"wrestling",attendance:{status:"present"}}),
      doc(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills/wrestling__double_leg`,{
        discipline:"wrestling",familyId:"double_leg",state:index===54?"APPLIED":"LEARNED",
        coachUid:"batch-e-admin",verifiedAt:iso(index)})
    );
  }
  const scenarios={
    smallComplete:{athleteId:"batch-e-small-complete",expected:"certifiable"},
    largeResumable:{athleteId,practiceCount:55,priorLocationCount:11,crossTrainingHost:cross,
      expected:"certifiable-after-resume"},
    missingCanonicalMemory:{athleteId:"batch-e-missing-memory",expectedBlocker:"source-record-invalid"},
    missingAttendanceMembership:{athleteId:"batch-e-missing-attendance",expectedBlocker:"attendance-index-incomplete"},
    conflictingObservations:{athleteId:"batch-e-conflict",expectedBlocker:"conflicting-latest-state"},
    sourceRevisionMutation:{athleteId:"batch-e-revision-change",expectedBlocker:"source-revision-changed"},
    staleReviewIdentity:{athleteId:"batch-e-stale-review",expectedBlocker:"review-revision-mismatch"},
    interruptedCertification:{athleteId:"batch-e-interrupted",expected:"resume-from-server-cursor"},
    revocationAfterAcceptance:{athleteId:"batch-e-revoked",expectedBlocker:"large-history-authority-invalid-or-stale"},
  };
  return {fixtureOwner:"batch-e-certification",syntheticOnly:true,documents,scenarios};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  console.log(JSON.stringify(buildSyntheticCertificationFixtures(),null,2));
}
