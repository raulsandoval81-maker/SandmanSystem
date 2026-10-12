import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";

const CERTIFICATION_RECORD_LIMIT = 10_000;
const clean = value => String(value ?? "").trim();
const discipline = value => {
  const normalized=clean(value).toLowerCase().replace(/[\s_]+/g,"-");
  return ["kickboxing","kick-boxing","muaythai"].includes(normalized)?"muay-thai":normalized;
};
const unique = values => [...new Set(values.filter(Boolean))].sort();

export async function authorizeHistoricalInspection(env=process.env) {
  const projectId=clean(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||env.SANDMAN_STAGING_PROJECT_ID);
  if (clean(env.FIRESTORE_EMULATOR_HOST)) {
    if (!projectId.startsWith("demo-")) throw new Error("Emulator inspection requires a demo-* project ID.");
    return {mode:"emulator",projectId};
  }
  if (env.SANDMAN_STAGING_INSPECTION_CONFIRM!=="INSPECT:sandman-combat-staging") {
    throw new Error("Non-emulator inspection requires explicit staging-only confirmation.");
  }
  const boundary=await verifyStagingBoundary(env);
  return {mode:"staging",projectId:boundary.projectId};
}

export function analyzeHistoricalEvidence({athletes=[],practices=[],attendance=[],memories=[],skills=[],assignments=[]}) {
  const issues=[];
  const athleteById=new Map(athletes.map(item=>[item.path.split("/").at(-1),item.data||{}]));
  const practiceById=new Map(practices.map(item=>[item.path.split("/").at(-1),item.data||{}]));
  const attendanceByPractice=new Map(attendance.map(item=>[
    clean(item.data?.practiceId)||item.path.split("/").at(-1),item.data||{}]));
  const memoryPaths=new Set(memories.map(item=>item.path));
  const counts=new Map();
  const assignmentScopes=new Map();
  for (const item of assignments) {
    const data=item.data||{},athleteId=clean(data.athleteId);
    if (!athleteId) continue;
    const scopes=assignmentScopes.get(athleteId)||new Set();
    [data.homeLocationId,data.hostLocationId].map(clean).filter(Boolean).forEach(value=>scopes.add(value));
    assignmentScopes.set(athleteId,scopes);
  }
  for (const item of memories) {
    const segments=item.path.split("/"),data=item.data||{};
    if (segments.length!==4||segments[0]!=="practiceSessions"||segments[2]!=="athletes") {
      issues.push({severity:"high",code:"unexpected-memory-path",path:item.path});
      continue;
    }
    const practiceId=segments[1],pathAthleteId=segments[3],athleteId=clean(data.athleteId);
    const memoryDiscipline=discipline(data.discipline),practice=practiceById.get(practiceId)||{};
    if (!athleteId||athleteId!==pathAthleteId||!clean(data.practiceId)||clean(data.practiceId)!==practiceId) {
      issues.push({severity:"high",code:"memory-canonical-identity-missing-or-mismatched",path:item.path});
    }
    if (!memoryDiscipline||memoryDiscipline!==discipline(practice.discipline)) {
      issues.push({severity:"high",code:"memory-discipline-mismatch",path:item.path});
    }
    const attendanceRecord=attendanceByPractice.get(practiceId);
    const presentIds=Array.isArray(attendanceRecord?.presentIds)?attendanceRecord.presentIds.map(clean):[];
    if (!attendanceRecord||attendanceRecord.finalized!==true
        || clean(attendanceRecord.status).toLowerCase()!=="finalized"
        || !presentIds.includes(pathAthleteId)) {
      issues.push({severity:"high",code:"attendance-to-memory-mismatch",path:item.path});
    }
    const athlete=athleteById.get(pathAthleteId)||{};
    const allowed=new Set(unique([athlete.locationId,athlete.academyId,
      ...(Array.isArray(athlete.previousLocationIds)?athlete.previousLocationIds:[]),
      ...(assignmentScopes.get(pathAthleteId)||[])] .map(clean)));
    const practiceScope=clean(practice.locationId||practice.academyId);
    if (!practiceScope||!allowed.has(practiceScope)) {
      issues.push({severity:"medium",code:"historical-scope-conflict",path:item.path});
    }
    const key=`${pathAthleteId}|${memoryDiscipline}`;
    counts.set(key,(counts.get(key)||0)+1);
  }
  for (const item of skills) {
    const parent=item.path.split("/").slice(0,-2).join("/");
    if (!memoryPaths.has(parent)) issues.push({severity:"high",code:"orphaned-verified-skill",path:item.path});
    const segments=item.path.split("/"),practice=practiceById.get(segments[1])||{};
    if (!discipline(item.data?.discipline)||discipline(item.data?.discipline)!==discipline(practice.discipline)) {
      issues.push({severity:"high",code:"verified-skill-discipline-mismatch",path:item.path});
    }
  }
  for (const [identity,count] of counts) if (count>CERTIFICATION_RECORD_LIMIT) {
    issues.push({severity:"high",code:"history-certification-limit-exceeded",identity,count,
      limit:CERTIFICATION_RECORD_LIMIT});
  }
  return {readOnly:true,counts:{athletes:athletes.length,practices:practices.length,
    attendance:attendance.length,memories:memories.length,verifiedSkills:skills.length,
    assignments:assignments.length},issueCount:issues.length,
    issues:issues.sort((a,b)=>a.code.localeCompare(b.code)||clean(a.path).localeCompare(clean(b.path)))};
}

async function snapshotRecords(snapshot) {
  return snapshot.docs.map(doc=>({path:doc.ref.path,data:doc.data()}));
}

export async function inspectHistoricalEvidence(env=process.env) {
  const authorization=await authorizeHistoricalInspection(env);
  const app=initializeApp({projectId:authorization.projectId},`historical-inspection-${Date.now()}`);
  try {
    const db=getFirestore(app);
    const [athletes,practices,attendance,memories,skills,assignments]=await Promise.all([
      db.collection("athletes").get(),db.collection("practiceSessions").get(),
      db.collection("attendance_sessions").get(),db.collectionGroup("athletes").get(),
      db.collectionGroup("verifiedSkills").get(),db.collection("athleteCrossTrainingAssignments").get(),
    ]);
    const practiceMemories=(await snapshotRecords(memories)).filter(({path})=>
      /^practiceSessions\/[^/]+\/athletes\/[^/]+$/.test(path));
    const practiceSkills=(await snapshotRecords(skills)).filter(({path})=>
      /^practiceSessions\/[^/]+\/verifiedSkills\/[^/]+$/.test(path));
    return {...analyzeHistoricalEvidence({athletes:await snapshotRecords(athletes),
      practices:await snapshotRecords(practices),attendance:await snapshotRecords(attendance),
      memories:practiceMemories,skills:practiceSkills,
      assignments:await snapshotRecords(assignments)}),environment:authorization.mode,
      projectId:authorization.projectId};
  } finally { await deleteApp(app); }
}

if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await inspectHistoricalEvidence(),null,2));
}
