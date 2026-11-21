const test=require("node:test"),assert=require("node:assert/strict");
const{generateKeyPairSync,sign}=require("node:crypto"),{mkdtempSync,readFileSync}=require("node:fs"),{tmpdir}=require("node:os"),{join}=require("node:path");
const{AthleteTransferService,AttendanceService,CommercialFoundation,CommercialInvitationService,CurriculumService,FamilyRelationshipService,InMemoryTestIdentityAuthority,JwtIdentityAuthority,OrganizationOnboardingService,PATH2LEGEND_RANKS,PersistentJsonCommercialStore,PostgresCommercialBoundary,ProgressionReadService,ROAD2CHAMPION_RANKS,RecoveryEvidenceService,SchedulingService,XpLedgerService}=require("../lib");
const A="complete-alpha",B="complete-beta",now=()=>new Date("2026-11-20T20:00:00Z");
const onboarding=org=>({organizationId:org,organizationName:org,academyId:"academy",academyName:"Academy",locationId:"location",locationName:"Gym",programId:"program",programName:"Wrestling",disciplines:["wrestling"],administratorUserId:`admin-${org}`,coachUserId:`coach-${org}`,packageSource:"Plus",capabilityIds:["schedule.manage","attendance.manage","coach.workspace"],startsAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"});
function setup(){const file=join(mkdtempSync(join(tmpdir(),"commercial-completion-")),"store.json"),identity=new InMemoryTestIdentityAuthority(),store=new PersistentJsonCommercialStore(file),foundation=new CommercialFoundation(store,identity,now),onboard=new OrganizationOnboardingService(foundation);for(const org of[A,B])onboard.onboard(identity.mint("root",org,true),onboarding(org));return{file,identity,store,foundation,family:new FamilyRelationshipService(foundation),curriculum:new CurriculumService(foundation,now),xp:new XpLedgerService(foundation,now),read:new ProgressionReadService(foundation),schedule:new SchedulingService(foundation),attendance:new AttendanceService(foundation,now),recovery:new RecoveryEvidenceService(foundation,now),admin:org=>identity.mint(`admin-${org}`,org),coach:org=>identity.mint(`coach-${org}`,org)};}
function curriculum(org,pathway="road2champion"){return{id:"curriculum",organizationId:org,academyId:"academy",discipline:"wrestling",version:"1",pathway,ranks:[...(pathway==="road2champion"?ROAD2CHAMPION_RANKS:PATH2LEGEND_RANKS)],skills:[{id:"stance",category:"core",name:"Stance",required:true}],state:"active"};}
function athleteFlow(f,org,{adult=false,pathway="road2champion"}={}){const admin=f.admin(org),user=`athlete-${org}`;f.family.registerAthlete(admin,{id:"athlete",organizationId:org,academyId:"academy",locationId:"location",programId:"program",displayName:"Synthetic Athlete",synthetic:true,participationState:"active",adult,assignedCoachUserIds:[`coach-${org}`]});f.curriculum.createDefinition(admin,curriculum(org,pathway));f.curriculum.assign(admin,{id:"assignment",organizationId:org,athleteId:"athlete",curriculumId:"curriculum",state:"active"});f.foundation.assignMembership(admin,{id:"athlete-member",organizationId:org,userId:user,role:adult?"adult_athlete":"athlete",scopeType:"organization",scopeId:org,state:"active"});f.family.linkAthleteIdentity(admin,{id:"athlete-link",organizationId:org,userId:user,athleteId:"athlete",state:"active",access:adult?"adult_self":"minor_read_only"});return{admin,coach:f.coach(org),athlete:f.identity.mint(user,org)};}

// Test-only stand-in for the host's independently verified cross-org identity registry.
const verifiedAthleteBinding={sameAthlete:input=>
  input.sourceOrganizationId===A&&input.sourceAthleteId==="athlete"&&
  input.destinationOrganizationId===B&&input.destinationAthleteId==="athlete"&&
  ["adult","guardian"].includes(input.consentType)&&
  typeof input.packageDigest==="string"&&input.packageDigest.length===64};

const jwt=(privateKey,kid,claims)=>{const head=Buffer.from(JSON.stringify({alg:"RS256",kid})).toString("base64url"),body=Buffer.from(JSON.stringify(claims)).toString("base64url"),signature=sign("RSA-SHA256",Buffer.from(`${head}.${body}`),privateKey).toString("base64url");return`${head}.${body}.${signature}`;};
test("production JWT authority verifies signature, issuer, audience, expiry, and revocation",()=>{const{privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048}),base={iss:"sandman-id",aud:"commercial",sub:"user-1",org:A,exp:Math.floor(now().getTime()/1000)+300,jti:"jti-1"},authority=new JwtIdentityAuthority({issuer:"sandman-id",audience:"commercial",publicKey:()=>publicKey.export({type:"spki",format:"pem"}),isRevoked:jti=>jti==="revoked",now});assert.equal(authority.verify({sessionId:jwt(privateKey,"key-1",base)}).userId,"user-1");for(const claims of[{...base,aud:"wrong"},{...base,exp:1},{...base,jti:"revoked"}])assert.throws(()=>authority.verify({sessionId:jwt(privateKey,"key-1",claims)}),/UNVERIFIED_IDENTITY/);assert.throws(()=>authority.verify({sessionId:"forged"}),/UNVERIFIED_IDENTITY/);});

test("durable invitations use email proof, hashed one-time tokens, expiry, and replay denial",()=>{const f=setup(),proofSessions=new Map([["proof",{userId:"new-coach",verifiedEmail:"coach@example.test"}]]),proof={verify:ctx=>{const value=proofSessions.get(ctx.sessionId);if(!value)throw new Error("UNVERIFIED_ACCOUNT_PROOF");return value;}},service=new CommercialInvitationService(f.foundation,proof,now,()=>"secret-token");const issued=service.issue(f.admin(A),{id:"invite",organizationId:A,email:"Coach@Example.Test",role:"coach",scopeType:"location",scopeId:"location",expiresAt:"2026-12-01T00:00:00Z"});assert.equal(issued.invitation.tokenDigest,"[REDACTED]");assert.notEqual(f.store.get("accessInvitations",A,"invite").tokenDigest,"secret-token");assert.throws(()=>service.accept({sessionId:"proof"},{organizationId:A,invitationId:"invite",token:"wrong"}),/NOT_CONSUMABLE/);assert.equal(service.accept({sessionId:"proof"},{organizationId:A,invitationId:"invite",token:"secret-token"}).state,"active");assert.throws(()=>service.accept({sessionId:"proof"},{organizationId:A,invitationId:"invite",token:"secret-token"}),/NOT_CONSUMABLE/);assert.equal(new PersistentJsonCommercialStore(f.file).get("accessInvitations",A,"invite").state,"accepted");});
test("invitation acceptance rejects the wrong verified email and expired proof",()=>{const f=setup(),proof={verify:ctx=>({userId:"user",verifiedEmail:ctx.sessionId==="wrong"?"wrong@example.test":"right@example.test"})},service=new CommercialInvitationService(f.foundation,proof,now,()=>"token");service.issue(f.admin(A),{id:"invite",organizationId:A,email:"right@example.test",role:"parent",scopeType:"organization",scopeId:A,expiresAt:"2026-11-21T00:00:00Z"});assert.throws(()=>service.accept({sessionId:"wrong"},{organizationId:A,invitationId:"invite",token:"token"}),/NOT_CONSUMABLE/);const expired=new CommercialInvitationService(f.foundation,proof,()=>new Date("2026-11-22T00:00:00Z"));assert.throws(()=>expired.accept({sessionId:"right"},{organizationId:A,invitationId:"invite",token:"token"}),/NOT_CONSUMABLE/);});
test("staff invitation authority is limited to Organization Admin or the matching Location Manager",()=>{const f=setup(),admin=f.admin(A);f.foundation.assignMembership(admin,{id:"location-manager",organizationId:A,userId:"location-manager",role:"management",scopeType:"location",scopeId:"location",state:"active"});f.foundation.assignMembership(admin,{id:"org-manager",organizationId:A,userId:"org-manager",role:"management",scopeType:"organization",scopeId:A,state:"active"});const proof={verify:()=>({userId:"unused",verifiedEmail:"unused@example.test"})},tokens=["one","two"],service=new CommercialInvitationService(f.foundation,proof,now,()=>tokens.shift());assert.equal(service.issue(f.identity.mint("location-manager",A),{id:"scoped",organizationId:A,email:"coach@example.test",role:"coach",scopeType:"location",scopeId:"location",expiresAt:"2026-12-01T00:00:00Z"}).invitation.state,"pending");assert.throws(()=>service.issue(f.identity.mint("org-manager",A),{id:"escalate",organizationId:A,email:"manager@example.test",role:"management",scopeType:"organization",scopeId:A,expiresAt:"2026-12-01T00:00:00Z"}),/INVALID_ACCESS_INVITATION/);});

test("adult consent and receiving Management acceptance preserve portable progression without demotion",()=>{const f=setup(),source=athleteFlow(f,A,{adult:true}),destination=athleteFlow(f,B,{adult:true});f.xp.adjust(source.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"earned",amount:400,reason:"synthetic"});const transfers=new AthleteTransferService(f.foundation,f.read,Buffer.alloc(32,7),now,verifiedAthleteBinding),pkg=transfers.consentAdult(source.athlete,A,B,"2026-12-01T00:00:00Z"),accepted=transfers.accept(destination.admin,{organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg,acceptanceId:"accept-1"});assert.equal(accepted.sourceOrganizationId,A);assert.equal(f.store.get("progressionCycles",B,"cycle-assignment").activeXp,400);assert.equal(f.store.practiceNotes.size,0);assert.throws(()=>transfers.accept(destination.admin,{organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg,acceptanceId:"accept-2"}),/TRANSFER_REPLAY_DENIED/);assert.equal(new PersistentJsonCommercialStore(f.file).get("transferAcceptances",B,"accept-1").lifetimeXp,400);});

test("transfer rejects tampering, wrong destination, incompatible pathway, and unauthorized acceptance",()=>{const f=setup(),source=athleteFlow(f,A,{adult:true}),destination=athleteFlow(f,B,{adult:true,pathway:"path2legend"}),transfers=new AthleteTransferService(f.foundation,f.read,Buffer.alloc(32,9),now,verifiedAthleteBinding),pkg=transfers.consentAdult(source.athlete,A,B,"2026-12-01T00:00:00Z");assert.throws(()=>transfers.accept(destination.admin,{organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg+"x",acceptanceId:"x"}),/SIGNATURE/);assert.throws(()=>transfers.accept(destination.admin,{organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg,acceptanceId:"x"}),/CURRICULUM_INCOMPATIBLE/);assert.throws(()=>transfers.accept(f.coach(B),{organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg,acceptanceId:"x"}),/ROLE_DENIED/);});
test("restart rejects tampered accepted transfer lineage",()=>{const f=setup(),source=athleteFlow(f,A,{adult:true}),destination=athleteFlow(f,B,{adult:true}),transfers=new AthleteTransferService(f.foundation,f.read,Buffer.alloc(32,5),now,verifiedAthleteBinding),pkg=transfers.consentAdult(source.athlete,A,B,"2026-12-01T00:00:00Z");transfers.accept(destination.admin,{organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg,acceptanceId:"accepted"});const data=JSON.parse(readFileSync(f.file,"utf8"));data.transferAcceptances[0].promotionHistory.push({fromRank:"forged",toRank:"legend",promotedAt:"2026-01-01T00:00:00Z"});require("node:fs").writeFileSync(f.file,JSON.stringify(data));assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_TRANSFER_ACCEPTANCE/);});

test("one verified return practice clears the lock, awards zero XP, and the next practice earns normally without repayment",()=>{const f=setup(),x=athleteFlow(f,A);for(const [id,start,end] of [["return-session","2026-11-19T18:00:00Z","2026-11-19T19:00:00Z"],["next-session","2026-11-20T18:00:00Z","2026-11-20T19:00:00Z"]]){f.schedule.create(x.admin,{id,organizationId:A,academyId:"academy",locationId:"location",programId:"program",coachUserIds:[`coach-${A}`],startsAt:start,endsAt:end,state:"completed"});f.attendance.record(x.coach,A,id,"athlete","present");}f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"seed",amount:220,reason:"synthetic stripe floor"});f.recovery.open(x.admin,{id:"recovery",organizationId:A,athleteId:"athlete",inactivityStartedAt:"2026-01-01T00:00:00Z"});for(const inactivityDay of[28,35,49,63,77])f.recovery.applyPenalty(x.admin,{organizationId:A,caseId:"recovery",inactivityDay});const recovery=f.store.get("recoveryCases",A,"recovery");assert.equal(recovery.deductedXp,20);assert.equal(recovery.forgivenXp,130);assert.equal(f.store.get("progressionCycles",A,"cycle-assignment").activeXp,200);assert.equal("recoveryDebtXp" in recovery,false);assert.throws(()=>f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"locked",lane:"strength",amount:5,source:"structured-strength",practiceSessionId:"next-session"}),/RECOVERY_RETURN_PRACTICE_REQUIRED/);assert.throws(()=>f.recovery.verifyPractice(x.coach,{organizationId:A,caseId:"recovery",sessionId:"return-session",fullParticipation:false}),/EVIDENCE_UNVERIFIED/);f.recovery.verifyPractice(x.coach,{organizationId:A,caseId:"recovery",sessionId:"return-session",fullParticipation:true});assert.equal(new PersistentJsonCommercialStore(f.file).get("recoveryCases",A,"recovery").state,"completed");assert.equal(f.store.xpEvents.size,1);assert.throws(()=>f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"return-xp",lane:"strength",amount:5,source:"structured-strength",practiceSessionId:"return-session"}),/ZERO_COMBAT_XP/);const earned=f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"next-xp",lane:"strength",amount:5,source:"structured-strength",practiceSessionId:"next-session"});assert.equal(earned.amount,5);assert.equal(f.store.get("progressionCycles",A,"cycle-assignment").activeXp,205);assert.equal("debtRepaid" in earned,false);assert.throws(()=>f.recovery.activateRecovery(),/MANUAL_RECOVERY_AWARD_FORBIDDEN/);});

test("PostgreSQL schema defines tenant RLS, composite references, replay constraints, and append-only ledgers",()=>{const sql=readFileSync(join(__dirname,"../postgres/0001_commercial_core.sql"),"utf8");for(const pattern of[/ENABLE ROW LEVEL SECURITY/g,/FORCE ROW LEVEL SECURITY/g,/WITH CHECK \(organization_id=commercial_current_tenant\(\)\)/g,/UNIQUE \(organization_id,source_event_id\)/,/FOREIGN KEY \(organization_id,athlete_id\)/,/FOREIGN KEY \(organization_id,assignment_id\)/,/xp_events_append_only/,/promotions_append_only/,/UNIQUE \(organization_id,package_digest\)/])assert.match(sql,pattern);assert.doesNotMatch(sql,/firebase|stripe_(customer|payment)|academy_production/i);});

test("PostgreSQL boundary rolls back failed migrations and scopes every tenant transaction",async()=>{const calls=[],client={query:async(text,values)=>{calls.push([text,values]);if(text.startsWith("SELECT checksum"))return{rows:[],rowCount:0};return{rows:[],rowCount:0};}},boundary=new PostgresCommercialBoundary(client);assert.equal(await boundary.migrate("0001_core","SELECT 1"),"applied");await boundary.tenantTransaction(A,async db=>{await db.query("SELECT 1")});assert.ok(calls.some(([q,v])=>q.includes("set_config")&&v[0]===A));const failing={query:async text=>{calls.push([text]);if(text==="BROKEN")throw new Error("boom");return{rows:[],rowCount:0};}},broken=new PostgresCommercialBoundary(failing);await assert.rejects(()=>broken.migrate("0002_broken","BROKEN"),/boom/);assert.ok(calls.some(([q])=>q==="ROLLBACK"));});


test("recovery practice evidence rejects same-program sessions from another academy or location",()=>{
  const f=setup(),x=athleteFlow(f,A);
  f.schedule.create(x.admin,{id:"return-session",organizationId:A,academyId:"academy",locationId:"location",programId:"program",coachUserIds:[`coach-${A}`],startsAt:"2026-11-19T18:00:00Z",endsAt:"2026-11-19T19:00:00Z",state:"completed"});
  f.attendance.record(x.coach,A,"return-session","athlete","present");
  f.recovery.open(x.admin,{id:"recovery",organizationId:A,athleteId:"athlete",inactivityStartedAt:"2026-11-01T00:00:00Z"});
  const session=f.store.get("sessions",A,"return-session");
  for(const changed of [{academyId:"unrelated-academy"},{locationId:"unrelated-location"}]){
    f.store.put("sessions",{...session,...changed},true);
    assert.throws(()=>f.recovery.verifyPractice(x.coach,{organizationId:A,caseId:"recovery",sessionId:"return-session",fullParticipation:true}),/RECOVERY_PRACTICE_EVIDENCE_UNVERIFIED/);
    assert.equal(f.store.recoveryEvidence.size,0);
    assert.equal(f.store.get("recoveryCases",A,"recovery").state,"evidence_pending");
  }
  f.store.put("sessions",session,true);
  assert.equal(f.recovery.verifyPractice(x.coach,{organizationId:A,caseId:"recovery",sessionId:"return-session",fullParticipation:true}).fullParticipation,true);
  assert.equal(f.store.xpEvents.size,0);
});


test("transfer fails closed without independently verified source-to-destination identity binding",()=>{
  const f=setup(),source=athleteFlow(f,A,{adult:true}),destination=athleteFlow(f,B,{adult:true});
  const key=Buffer.alloc(32,11);
  const withoutProof=new AthleteTransferService(f.foundation,f.read,key,now);
  const pkg=withoutProof.consentAdult(source.athlete,A,B,"2026-12-01T00:00:00Z");
  const request={organizationId:B,destinationAthleteId:"athlete",transferPackage:pkg,acceptanceId:"no-proof"};
  assert.throws(()=>withoutProof.accept(destination.admin,request),/TRANSFER_ATHLETE_IDENTITY_UNVERIFIED/);
  const wrongPerson=new AthleteTransferService(f.foundation,f.read,key,now,{sameAthlete:()=>false});
  assert.throws(()=>wrongPerson.accept(destination.admin,{...request,acceptanceId:"wrong-person"}),/TRANSFER_ATHLETE_IDENTITY_UNVERIFIED/);
  assert.equal(f.store.transferAcceptances.size,0);
  assert.equal(f.store.get("progressionCycles",B,"cycle-assignment").activeXp,0);
  assert.equal(f.store.xpEvents.size,0);
  const verified=new AthleteTransferService(f.foundation,f.read,key,now,verifiedAthleteBinding);
  assert.equal(verified.accept(destination.admin,{...request,acceptanceId:"verified"}).destinationAthleteId,"athlete");
});


test("post-recovery XP rejects omitted, forged, old, unverified and return-session provenance",()=>{
  const f=setup(),x=athleteFlow(f,A);
  const sessions=[
    ["old-session","2026-01-01T18:00:00Z","2026-01-01T19:00:00Z"],
    ["return-session","2026-11-19T18:00:00Z","2026-11-19T19:00:00Z"],
    ["next-session","2026-11-20T18:00:00Z","2026-11-20T19:00:00Z"],
    ["no-attendance","2026-11-20T18:00:00Z","2026-11-20T19:00:00Z"]
  ];
  for(const [id,start,end] of sessions){
    f.schedule.create(x.admin,{id,organizationId:A,academyId:"academy",locationId:"location",programId:"program",coachUserIds:[`coach-${A}`],startsAt:start,endsAt:end,state:"completed"});
    if(id!=="no-attendance")f.attendance.record(x.coach,A,id,"athlete","present");
  }
  f.recovery.open(x.admin,{id:"recovery",organizationId:A,athleteId:"athlete",inactivityStartedAt:"2026-11-01T00:00:00Z"});
  assert.throws(()=>f.recovery.verifyPractice(x.coach,{organizationId:A,caseId:"recovery",sessionId:"old-session",fullParticipation:true}),/RECOVERY_PRACTICE_EVIDENCE_UNVERIFIED/);
  f.recovery.verifyPractice(x.coach,{organizationId:A,caseId:"recovery",sessionId:"return-session",fullParticipation:true});
  const award=(sourceEventId,practiceSessionId)=>f.xp.submitCoach(x.coach,{
    organizationId:A,athleteId:"athlete",sourceEventId,lane:"strength",amount:5,
    source:"structured-strength",...(practiceSessionId===undefined?{}:{practiceSessionId})
  });
  const checks=[
    ["omitted",undefined,/RECOVERY_XP_PRACTICE_REQUIRED/],
    ["forged","made-up",/RECOVERY_XP_PRACTICE_UNVERIFIED/],
    ["return","return-session",/RETURN_PRACTICE_AWARDS_ZERO_COMBAT_XP/],
    ["old","old-session",/RECOVERY_XP_PRACTICE_NOT_AFTER_RETURN/],
    ["missing-attendance","no-attendance",/RECOVERY_XP_PRACTICE_UNVERIFIED/]
  ];
  for(const [id,session,expected] of checks)assert.throws(()=>award(id,session),expected);
  assert.equal(f.store.xpEvents.size,0);
  assert.equal(f.store.get("progressionCycles",A,"cycle-assignment").activeXp,0);
  assert.equal(award("after-return","next-session").amount,5);
  assert.equal(f.store.get("progressionCycles",A,"cycle-assignment").activeXp,5);
});


test("PostgreSQL boundaries sharing a connection serialize tenant contexts",async()=>{
  const trace=[];
  let activeTenant;
  const client={query:async(sql,values)=>{
    trace.push(sql==="SELECT set_config('app.organization_id', $1, true)"?`SET:${values[0]}`:sql);
    if(sql==="BEGIN"){assert.equal(activeTenant,undefined,"a second transaction entered before the first committed");}
    if(sql==="SELECT set_config('app.organization_id', $1, true)")activeTenant=values[0];
    if(sql==="SELECT active_tenant")return{rows:[{tenant:activeTenant}],rowCount:1};
    if(sql==="COMMIT"||sql==="ROLLBACK")activeTenant=undefined;
    return{rows:[],rowCount:0};
  }};
  const a=new PostgresCommercialBoundary(client),b=new PostgresCommercialBoundary(client);
  const [tenantA,tenantB]=await Promise.all([
    a.tenantTransaction(A,async db=>{
      const first=(await db.query("SELECT active_tenant")).rows[0].tenant;
      await Promise.resolve();
      const second=(await db.query("SELECT active_tenant")).rows[0].tenant;
      assert.equal(first,second);
      return second;
    }),
    b.tenantTransaction(B,async db=>(await db.query("SELECT active_tenant")).rows[0].tenant)
  ]);
  assert.equal(tenantA,A);
  assert.equal(tenantB,B);
  assert.deepEqual(trace,[
    "BEGIN",`SET:${A}`,"SELECT active_tenant","SELECT active_tenant","COMMIT",
    "BEGIN",`SET:${B}`,"SELECT active_tenant","COMMIT"
  ]);
});
