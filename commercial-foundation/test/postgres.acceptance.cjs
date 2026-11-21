const test=require("node:test"),assert=require("node:assert/strict");
const {readFileSync,readdirSync}=require("node:fs"),{join}=require("node:path"),{generateKeyPairSync,sign}=require("node:crypto");
const lib=require("../lib");

const url=process.env.DATABASE_URL;
if(!url)throw new Error("DATABASE_URL_REQUIRED");
const now=()=>new Date("2026-11-20T20:00:00Z"),identity=new lib.InMemoryTestIdentityAuthority();
const pool=lib.createPrivateCommercialPool(url,{max:8,connectionTimeoutMillis:10_000});
const app=new lib.PostgresCommercialApplication(pool,identity,now),boundary=new lib.PooledPostgresCommercialBoundary(pool);
const orgs=[{id:"sprint7-v2-wrestling",name:"Test Wrestling Academy",discipline:"wrestling"},{id:"sprint7-v2-combat",name:"Test Combat Academy",discipline:"boxing"}];
const contexts=new Map();
const oidcIssuer="https://identity.example.test/",oidcAudience="sandman-commercial",oidcKeys=generateKeyPairSync("rsa",{modulusLength:2048}),oidcJwk={...oidcKeys.publicKey.export({format:"jwk"}),kid:"acceptance-key",kty:"RSA",alg:"RS256",use:"sig"},revokedTokens=new Set();
const oidcToken=(userId,organizationId,email,jti)=>{const epoch=Math.floor(now().getTime()/1000),header=Buffer.from(JSON.stringify({alg:"RS256",typ:"JWT",kid:"acceptance-key"})).toString("base64url"),payload=Buffer.from(JSON.stringify({iss:oidcIssuer,aud:oidcAudience,sub:userId,org:organizationId,email,email_verified:true,iat:epoch-10,exp:epoch+3600,jti})).toString("base64url"),signature=sign("RSA-SHA256",Buffer.from(`${header}.${payload}`),oidcKeys.privateKey).toString("base64url");return`${header}.${payload}.${signature}`;};
const oidcStore=new lib.OidcJwksKeyStore({jwksUrl:"https://identity.example.test/jwks",fetch:async()=>({ok:true,status:200,json:async()=>({keys:[oidcJwk]}),headers:{get:()=>"max-age=300"}}),now}),oidc=new lib.OidcIdentityAuthority({issuer:oidcIssuer,audience:oidcAudience,keys:oidcStore,isRevoked:async (_organizationId,tokenId)=>revokedTokens.has(tokenId),now});

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

test("OIDC identity, PostgreSQL membership, invitation, switching, revocation, and scope integrate atomically",async()=>{
  const a=orgs[0],b=orgs[1],suffix=(process.env.RAILWAY_DEPLOYMENT_ID||Date.now().toString()).slice(-10),adminCtx={sessionId:oidcToken(`admin-${a.id}`,a.id,"admin@example.test",`admin-${suffix}`)},userCtx={sessionId:oidcToken(`invited-${suffix}`,"unassigned","invitee@example.test",`user-${suffix}`)};let sequence=0;
  const issuer={issueOrganizationToken:async(session,target)=>oidcToken(session.identity.userId,target,session.account.verifiedEmail,`switch-${suffix}-${++sequence}`)},revoker={revoke:async ({tokenId})=>{revokedTokens.add(tokenId);}},service=new lib.PostgresCommercialIdentityService(app,oidc,issuer,revoker,now);
  const issued=await service.issueInvitation(adminCtx,{id:`coach-${suffix}`,organizationId:a.id,email:"invitee@example.test",role:"coach",scopeType:"location",scopeId:"location",expiresAt:"2026-12-01T00:00:00Z"});
  const attempts=await Promise.allSettled([service.acceptInvitation(userCtx,{organizationId:a.id,invitationId:`coach-${suffix}`,token:issued.token}),service.acceptInvitation(userCtx,{organizationId:a.id,invitationId:`coach-${suffix}`,token:issued.token})]);assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);assert.equal(attempts.filter(x=>x.status==="rejected").length,1);
  assert.equal((await app.activeMemberships(a.id,`invited-${suffix}`))[0].scopeId,"location");assert.equal((await service.switchOrganization(userCtx,a.id)).sessionId.split(".").length,3);await assert.rejects(()=>service.switchOrganization(userCtx,b.id),/ORGANIZATION_SWITCH_DENIED/);
  const wrong=await service.issueInvitation(adminCtx,{id:`wrong-${suffix}`,organizationId:a.id,email:"owner@example.test",role:"parent",scopeType:"organization",scopeId:a.id,expiresAt:"2026-12-01T00:00:00Z"});await assert.rejects(()=>service.acceptInvitation(userCtx,{organizationId:a.id,invitationId:`wrong-${suffix}`,token:wrong.token}),/NOT_CONSUMABLE/);
  const revoked=await service.issueInvitation(adminCtx,{id:`revoked-${suffix}`,organizationId:a.id,email:"invitee@example.test",role:"parent",scopeType:"organization",scopeId:a.id,expiresAt:"2026-12-01T00:00:00Z"});await service.revokeInvitation(adminCtx,a.id,`revoked-${suffix}`);await assert.rejects(()=>service.acceptInvitation(userCtx,{organizationId:a.id,invitationId:`revoked-${suffix}`,token:revoked.token}),/NOT_CONSUMABLE/);
  const expiring=await service.issueInvitation(adminCtx,{id:`expired-${suffix}`,organizationId:a.id,email:"invitee@example.test",role:"parent",scopeType:"organization",scopeId:a.id,expiresAt:"2026-12-01T00:00:00Z"}),lateService=new lib.PostgresCommercialIdentityService(app,oidc,issuer,revoker,()=>new Date("2026-12-02T00:00:00Z"));await assert.rejects(()=>lateService.acceptInvitation(userCtx,{organizationId:a.id,invitationId:`expired-${suffix}`,token:expiring.token}),/NOT_CONSUMABLE/);
  const parent=await service.issueInvitation(adminCtx,{id:`parent-${suffix}`,organizationId:a.id,email:"parent@example.test",role:"parent",scopeType:"organization",scopeId:a.id,expiresAt:"2026-12-01T00:00:00Z"}),parentCtx={sessionId:oidcToken(`parent-${suffix}`,"unassigned","parent@example.test",`parent-${suffix}`)};await service.acceptInvitation(parentCtx,{organizationId:a.id,invitationId:`parent-${suffix}`,token:parent.token});const selectedParent=await service.switchOrganization(parentCtx,a.id);await assert.rejects(()=>service.runAuthorized(selectedParent,a.id,f=>new lib.ManagementService(f).overview(selectedParent,a.id)),/ROLE_DENIED/);
  const selected=await service.switchOrganization(userCtx,a.id);await app.runWithIdentity(a.id,adminCtx,(await oidc.verify(adminCtx)).identity,f=>{const membership=f.store.get("memberships",a.id,`accepted-coach-${suffix}`);f.store.put("memberships",{...membership,state:"suspended"},true);});await assert.rejects(()=>service.runAuthorized(selected,a.id,()=>true),/MEMBERSHIP_REQUIRED/);await app.runWithIdentity(a.id,adminCtx,(await oidc.verify(adminCtx)).identity,f=>f.revokeMembership(adminCtx,a.id,`accepted-coach-${suffix}`));assert.equal((await app.activeMemberships(a.id,`invited-${suffix}`)).length,0);
  await service.logout(adminCtx);assert.ok(revokedTokens.has(`admin-${suffix}`),"logout must revoke the original token ID");await assert.rejects(()=>oidc.verify(adminCtx),/UNVERIFIED_IDENTITY/);await assert.rejects(()=>service.runAuthorized(adminCtx,a.id,()=>true),/UNVERIFIED_IDENTITY/);
  await app.run(a.id,f=>{const audits=f.store.listAudits(a.id);assert.ok(audits.some(x=>x.resourceId===`coach-${suffix}`&&x.outcome==="permitted"));assert.ok(audits.some(x=>x.resourceId===`wrong-${suffix}`&&x.outcome==="rejected"));});
});

test("durable PostgreSQL revocation rejects the exact credential and stays tenant-scoped",async()=>{
  const a=orgs[0],b=orgs[1],jti=`durable-revoke-${Date.now()}`;
  const ctx={sessionId:oidcToken(`admin-${a.id}`,a.id,"admin@example.test",jti)};
  const revocations=new lib.PostgresTokenRevocationStore(boundary);
  const authority=new lib.OidcIdentityAuthority({issuer:oidcIssuer,audience:oidcAudience,keys:oidcStore,
    isRevoked:(organizationId,tokenId)=>revocations.isRevoked(organizationId,tokenId),now});
  assert.equal((await authority.verify(ctx)).identity.selectedOrganizationId,a.id);
  assert.equal(await revocations.isRevoked(a.id,jti),false);
  // PostgreSQL now() uses wall-clock time; the legacy synthetic JWT fixture uses a fixed clock.
  await revocations.revoke({organizationId:a.id,tokenId:jti,subject:`admin-${a.id}`,expiresAt:Math.floor(Date.now()/1000)+3600});
  assert.equal(await revocations.isRevoked(a.id,jti),true);
  assert.equal(await revocations.isRevoked(b.id,jti),false);
  await assert.rejects(()=>authority.verify(ctx),/UNVERIFIED_IDENTITY/);
});

test("synthetic tenant logical backup can restore a committed mutable-record loss",async()=>{
  const o=orgs[0];let backup;
  await boundary.tenantTransaction(o.id,async db=>{backup=(await db.query("SELECT kind,id,payload FROM commercial_application_records ORDER BY kind,id")).rows;});
  assert.ok(backup.length>0);
  const immutable=["xpEvents","promotions","recoveryEvidence","recoveryPenalties","transferAcceptances","audits"],target=backup.find(row=>row.kind!=="organization"&&!immutable.includes(row.kind));assert.ok(target);
  await boundary.tenantTransaction(o.id,async db=>{assert.equal((await db.query("DELETE FROM commercial_application_records WHERE kind=$1 AND id=$2",[target.kind,target.id])).rowCount,1);assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_application_records WHERE kind=$1 AND id=$2",[target.kind,target.id])).rows[0].n,0);});
  await boundary.tenantTransaction(o.id,async db=>{for(const row of backup){if(immutable.includes(row.kind))continue;await db.query("INSERT INTO commercial_application_records(organization_id,kind,id,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (organization_id,kind,id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[o.id,row.kind,row.id,JSON.stringify(row.payload)]);}});
  await app.run(o.id,f=>assert.equal(f.store.get("progressionCycles",o.id,"cycle-assignment").activeXp,205));
});
