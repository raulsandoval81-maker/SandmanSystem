const test=require("node:test"),assert=require("node:assert/strict");
const {readFileSync,readdirSync}=require("node:fs"),{join}=require("node:path");
const lib=require("../lib");

const url=process.env.DATABASE_URL;
if(!url)throw new Error("DATABASE_URL_REQUIRED");
const now=()=>new Date("2026-11-20T20:00:00Z"),identity=new lib.InMemoryTestIdentityAuthority();
const pool=lib.createPrivateCommercialPool(url,{max:8,connectionTimeoutMillis:10_000});
const app=new lib.PostgresCommercialApplication(pool,identity,now),boundary=new lib.PooledPostgresCommercialBoundary(pool);
const orgs=[{id:"sprint7-v2-wrestling",name:"Test Wrestling Academy",discipline:"wrestling"},{id:"sprint7-v2-combat",name:"Test Combat Academy",discipline:"boxing"}];
const contexts=new Map();

async function migrate(){for(const file of readdirSync(join(__dirname,"../postgres")).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort())await app.migrate(file.slice(0,-4),readFileSync(join(__dirname,"../postgres",file),"utf8"));}
function onboarding(o){return{organizationId:o.id,organizationName:o.name,academyId:"academy",academyName:o.name,locationId:"location",locationName:"Main Gym",programId:"program",programName:"Combat Program",disciplines:[o.discipline],administratorUserId:`admin-${o.id}`,coachUserId:`coach-${o.id}`,packageSource:"Plus",capabilityIds:["schedule.manage","attendance.manage","coach.workspace"],startsAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"};}
function curriculum(o){const ranks=o.discipline==="wrestling"?lib.ROAD2CHAMPION_RANKS:lib.PATH2LEGEND_RANKS;return{id:"curriculum",organizationId:o.id,academyId:"academy",discipline:o.discipline,version:"sprint7",pathway:o.discipline==="wrestling"?"road2champion":"path2legend",ranks:[...ranks],skills:[{id:"stance",category:"core",name:"Stance",required:true}],state:"active"};}

test.before(async()=>{
  await migrate();
  for(const o of orgs){
    const root=identity.mint("sprint7-root",o.id,true),admin=identity.mint(`admin-${o.id}`,o.id),coach=identity.mint(`coach-${o.id}`,o.id);contexts.set(o.id,{root,admin,coach});
    await app.run(o.id,f=>{if(!f.store.getOrganization(o.id))new lib.OrganizationOnboardingService(f).onboard(root,onboarding(o));});
    await app.run(o.id,f=>{
      if(f.store.get("athletes",o.id,"athlete"))return;
      const family=new lib.FamilyRelationshipService(f),curricula=new lib.CurriculumService(f,now),schedule=new lib.SchedulingService(f),attendance=new lib.AttendanceService(f,now),{admin,coach}=contexts.get(o.id);
      family.registerAthlete(admin,{id:"athlete",organizationId:o.id,academyId:"academy",locationId:"location",programId:"program",displayName:"Synthetic Sprint 7 Athlete",synthetic:true,participationState:"active",adult:true,assignedCoachUserIds:[`coach-${o.id}`]});
      curricula.createDefinition(admin,curriculum(o));curricula.assign(admin,{id:"assignment",organizationId:o.id,athleteId:"athlete",curriculumId:"curriculum",state:"active"});
      for(const [id,start,end] of [["return-session","2026-11-19T17:00:00Z","2026-11-19T18:00:00Z"],["next-session","2026-11-20T17:00:00Z","2026-11-20T18:00:00Z"]]){schedule.create(admin,{id,organizationId:o.id,academyId:"academy",locationId:"location",programId:"program",coachUserIds:[`coach-${o.id}`],startsAt:start,endsAt:end,state:"completed"});attendance.record(coach,o.id,id,"athlete","present");}
    });
  }
});
test.after(async()=>{await pool.close();});

test("migrations are checksum-idempotent",async()=>{const files=readdirSync(join(__dirname,"../postgres")).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();for(const file of files)assert.equal(await app.migrate(file.slice(0,-4),readFileSync(join(__dirname,"../postgres",file),"utf8")),"already_applied");});

test("RLS denies cross-tenant reads, writes, and tenant override through values",async()=>{
  const [a,b]=orgs;
  await boundary.tenantTransaction(a.id,async db=>{
    assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_application_records WHERE organization_id=$1",[b.id])).rows[0].n,0);
    await assert.rejects(()=>db.query("INSERT INTO commercial_application_records(organization_id,kind,id,payload) VALUES ($1,'audits','forged','{}')",[b.id]));
  });
  await assert.rejects(()=>app.run(b.id,f=>new lib.ManagementService(f).overview(contexts.get(a.id).admin,b.id)),/TENANT_BOUNDARY_DENIED/);
});

test("two tenant workflows preserve XP, recovery policy, audit attribution, and replay prevention",async()=>{
  for(const o of orgs)await app.run(o.id,f=>{const {admin,coach}=contexts.get(o.id),xp=new lib.XpLedgerService(f,now),recovery=new lib.RecoveryEvidenceService(f,now),stripeFloor=o.discipline==="wrestling"?200:250;if(!f.store.get("xpEvents",o.id,"seed")){xp.adjust(admin,{organizationId:o.id,athleteId:"athlete",sourceEventId:"seed",amount:stripeFloor+20,reason:"synthetic acceptance"});recovery.open(admin,{id:"recovery",organizationId:o.id,athleteId:"athlete",inactivityStartedAt:"2026-01-01T00:00:00Z"});for(const inactivityDay of[28,35,49,63,77])recovery.applyPenalty(admin,{organizationId:o.id,caseId:"recovery",inactivityDay});recovery.verifyPractice(coach,{organizationId:o.id,caseId:"recovery",sessionId:"return-session",fullParticipation:true});xp.submitCoach(coach,{organizationId:o.id,athleteId:"athlete",sourceEventId:"post-recovery",lane:"strength",amount:5,source:"structured-strength",practiceSessionId:"next-session"});}const cycle=f.store.get("progressionCycles",o.id,"cycle-assignment"),record=f.store.get("recoveryCases",o.id,"recovery");assert.equal(cycle.activeXp,stripeFloor+5);assert.equal(record.deductedXp,20);assert.equal(record.forgivenXp,130);assert.equal("recoveryDebtXp" in record,false);assert.throws(()=>xp.submitCoach(coach,{organizationId:o.id,athleteId:"athlete",sourceEventId:"post-recovery",lane:"strength",amount:5,source:"structured-strength",practiceSessionId:"next-session"}),/DUPLICATE/);assert.ok(f.store.listAudits(o.id).every(a=>a.selectedOrganizationId===o.id));});
});

test("failed and concurrent transactions remain isolated and release connections",async()=>{
  const [a,b]=orgs;
  await assert.rejects(()=>boundary.tenantTransaction(a.id,async db=>{await db.query("INSERT INTO commercial_application_records(organization_id,kind,id,payload) VALUES ($1,'audits','rollback-marker','{}')",[a.id]);throw new Error("synthetic rollback");}),/synthetic rollback/);
  await boundary.tenantTransaction(a.id,async db=>assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_application_records WHERE id='rollback-marker'")).rows[0].n,0));
  await Promise.all([a,b].map(o=>boundary.tenantTransaction(o.id,async db=>{await db.query("SELECT pg_sleep(0.05)");const rows=await db.query("SELECT DISTINCT organization_id FROM commercial_application_records");assert.deepEqual(rows.rows.map(x=>x.organization_id),[o.id]);})));
});

test("database-backed state survives a new pool and application instance",async()=>{
  const secondPool=lib.createPrivateCommercialPool(url,{max:2,connectionTimeoutMillis:10_000}),second=new lib.PostgresCommercialApplication(secondPool,identity,now),o=orgs[0];
  try{await second.run(o.id,f=>{assert.equal(f.store.get("progressionCycles",o.id,"cycle-assignment").activeXp,205);assert.equal(f.store.get("recoveryCases",o.id,"recovery").state,"completed");});}finally{await secondPool.close();}
});
