const test=require("node:test"),assert=require("node:assert/strict");
const{mkdtempSync,readFileSync,writeFileSync}=require("node:fs"),{tmpdir}=require("node:os"),{join}=require("node:path");
const{CommercialFoundation,CurriculumService,FamilyRelationshipService,InMemoryTestIdentityAuthority,OrganizationOnboardingService,PATH2LEGEND_RANKS,PersistentJsonCommercialStore,ProgressionReadService,ROAD2CHAMPION_RANKS,XpLedgerService}=require("../lib");
const A="xp-alpha",B="xp-beta",now=()=>new Date("2026-11-20T20:00:00Z");
const onboarding=org=>({organizationId:org,organizationName:org,academyId:"academy",academyName:"Academy",locationId:"location",locationName:"Gym",programId:"program",programName:"Wrestling",disciplines:["wrestling"],administratorUserId:`admin-${org}`,coachUserId:`coach-${org}`,packageSource:"Plus",capabilityIds:["schedule.manage","attendance.manage","coach.workspace"],startsAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"});
function setup(){const file=join(mkdtempSync(join(tmpdir(),"sandman-xp-")),"store.json"),identity=new InMemoryTestIdentityAuthority(),store=new PersistentJsonCommercialStore(file),foundation=new CommercialFoundation(store,identity,now),onboard=new OrganizationOnboardingService(foundation);for(const org of[A,B])onboard.onboard(identity.mint("root",org,true),onboarding(org));return{file,identity,store,foundation,family:new FamilyRelationshipService(foundation),curriculum:new CurriculumService(foundation,now),xp:new XpLedgerService(foundation,now),read:new ProgressionReadService(foundation),admin:org=>identity.mint(`admin-${org}`,org),coach:org=>identity.mint(`coach-${org}`,org)};}
function definition(org,pathway="road2champion"){return{id:"curriculum",organizationId:org,academyId:"academy",discipline:"wrestling",version:"1.0.0",pathway,ranks:[...(pathway==="road2champion"?ROAD2CHAMPION_RANKS:PATH2LEGEND_RANKS)],skills:[{id:"stance",category:"foundation",name:"Stance",required:true}],state:"active"};}
function flow(f,org,pathway="road2champion",progressionPermission=true){const admin=f.admin(org);f.family.registerAthlete(admin,{id:"athlete",organizationId:org,academyId:"academy",locationId:"location",programId:"program",displayName:"Synthetic Athlete",synthetic:true,participationState:"active",adult:false,assignedCoachUserIds:[`coach-${org}`]});f.curriculum.createDefinition(admin,definition(org,pathway));f.curriculum.assign(admin,{id:"assignment",organizationId:org,athleteId:"athlete",curriculumId:"curriculum",state:"active"});f.family.registerGuardian(admin,{id:"guardian",organizationId:org,userId:`parent-${org}`,displayName:"Synthetic Parent",state:"active",synthetic:true});f.foundation.assignMembership(admin,{id:"parent-member",organizationId:org,userId:`parent-${org}`,role:"parent",scopeType:"organization",scopeId:org,state:"active"});f.family.linkGuardian(admin,{id:"guardian-link",organizationId:org,guardianId:"guardian",athleteId:"athlete",state:"active",permissions:progressionPermission?["profile","progression"]:["profile"]});f.foundation.assignMembership(admin,{id:"athlete-member",organizationId:org,userId:`athlete-${org}`,role:"athlete",scopeType:"organization",scopeId:org,state:"active"});f.family.linkAthleteIdentity(admin,{id:"athlete-link",organizationId:org,userId:`athlete-${org}`,athleteId:"athlete",state:"active",access:"minor_read_only"});return{admin,coach:f.coach(org),parent:f.identity.mint(`parent-${org}`,org),athlete:f.identity.mint(`athlete-${org}`,org)};}

test("locked pathways total 10800 with exact rank order and thresholds",()=>{assert.deepEqual(ROAD2CHAMPION_RANKS.map(r=>[r.name,r.requiredXp]),[["Shadow",800],["Prospect",1600],["Competitor",2400],["Contender",2800],["Champion",3200]]);assert.deepEqual(PATH2LEGEND_RANKS.map(r=>[r.name,r.requiredXp]),[["Apprentice",1000],["Warrior",1600],["Hero",2400],["Veteran",2800],["Legend",3000]]);assert.equal(ROAD2CHAMPION_RANKS.reduce((n,r)=>n+r.requiredXp,0),10800);assert.equal(PATH2LEGEND_RANKS.reduce((n,r)=>n+r.requiredXp,0),10800);});
test("two tenants run isolated Coach XP and progression using overlapping IDs",()=>{const f=setup(),a=flow(f,A),b=flow(f,B);for(const [org,x]of[[A,a],[B,b]]){f.curriculum.evaluate(x.coach,{id:"evaluation",organizationId:org,assignmentId:"assignment",athleteId:"athlete",skillId:"stance",status:"approved"});f.xp.submitCoach(x.coach,{organizationId:org,athleteId:"athlete",sourceEventId:"strength-1",lane:"strength",amount:10,source:"structured-strength"});assert.equal(f.read.athlete(x.athlete,org).activeXp,10);assert.equal(f.read.parent(x.parent,org,"athlete").approvedSkills[0],"stance");}assert.equal(f.store.xpEvents.size,2);});
test("duplicate and replayed XP identifiers are rejected without double counting",()=>{const f=setup(),x=flow(f,A);const input={organizationId:A,athleteId:"athlete",sourceEventId:"honor-1",lane:"honor",amount:5,source:"verified-honor"};f.xp.submitCoach(x.coach,input);assert.throws(()=>f.xp.submitCoach(x.coach,input),/DUPLICATE/);assert.equal(f.read.athlete(x.athlete,A).activeXp,5);});
test("unassigned, forged, revoked, and cross-tenant coaches cannot award XP",()=>{const f=setup(),x=flow(f,A),input={organizationId:A,athleteId:"athlete",sourceEventId:"x",lane:"strength",amount:10,source:"structured-strength"};assert.throws(()=>f.xp.submitCoach({sessionId:"forged"},input),/UNVERIFIED/);assert.throws(()=>f.xp.submitCoach(f.coach(B),input),/TENANT_BOUNDARY/);f.foundation.revokeMembership(x.admin,A,"member-coach");assert.throws(()=>f.xp.submitCoach(x.coach,input),/MEMBERSHIP_REQUIRED/);});
test("fixed Coach award values and Management authority are enforced",()=>{const f=setup(),x=flow(f,A);assert.throws(()=>f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"bad",lane:"strength",amount:999,source:"client"}),/UNAPPROVED/);assert.throws(()=>f.xp.adjust(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"adjust",amount:5,reason:"no"}),/ROLE_DENIED/);});
test("assigned Coach controls season phase and can read only assigned athlete XP history",()=>{const f=setup(),x=flow(f,A);assert.equal(f.xp.setSeasonPhase(x.coach,A,"athlete","in_season").seasonPhase,"in_season");f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"season-strength",lane:"strength",amount:10,source:"structured-strength",reason:"coach note"});assert.equal(f.xp.coachHistory(x.coach,A,"athlete")[0].reason,"coach note");assert.equal(f.curriculum.readDefinition(x.admin,A,"curriculum").version,"1.0.0");});
test("promotion requires threshold and verified non-XP gates then resets only active cycle",()=>{const f=setup(),x=flow(f,A);assert.throws(()=>f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"p1",requirementsVerified:true}),/PREMATURE/);f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"threshold",amount:800,reason:"verified synthetic fixture"});assert.throws(()=>f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"p1",requirementsVerified:false}),/REQUIREMENTS_UNVERIFIED/);f.curriculum.evaluate(x.coach,{id:"required-skill",organizationId:A,assignmentId:"assignment",athleteId:"athlete",skillId:"stance",status:"approved"});f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"p1",requirementsVerified:true});const cycle=f.store.get("progressionCycles",A,"cycle-assignment");assert.equal(cycle.activeXp,0);assert.equal(cycle.lifetimeXp,800);assert.equal(cycle.rankIndex,1);assert.throws(()=>f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"p1",requirementsVerified:true}),/PREMATURE|DUPLICATE/);});
test("earned stripe floor blocks decay and history remains append only",()=>{const f=setup(),x=flow(f,A);f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"gain",amount:400,reason:"fixture"});assert.equal(f.read.athlete(x.athlete,A).earnedStripes,2);assert.throws(()=>f.xp.applyDecay(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"decay",amount:-250,reason:"verified decay"}),/DECAY_POLICY_UNVERIFIED/);assert.equal(f.xp.history(x.admin,A,"athlete").length,1);});
test("corrections cannot erase XP preserved by a historical promotion",()=>{const f=setup(),x=flow(f,A);f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"gain",amount:800,reason:"fixture"});f.curriculum.evaluate(x.coach,{id:"required-skill",organizationId:A,assignmentId:"assignment",athleteId:"athlete",skillId:"stance",status:"approved"});f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"promotion",requirementsVerified:true});assert.throws(()=>f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"bad-correction",amount:-5,reason:"invalid historical reduction",correctionOf:"gain"}),/PROMOTION_HISTORY_FLOOR_PROTECTED/);assert.equal(f.store.get("progressionCycles",A,"cycle-assignment").lifetimeXp,800);});
test("unverified recovery schedule cannot be activated",()=>{const f=setup();assert.throws(()=>f.xp.recordRecoveryCandidate(),/RECOVERY_POLICY_UNVERIFIED/);});
test("Parent progression requires separate permission while Athlete remains read only",()=>{const f=setup(),x=flow(f,A,"road2champion",false);assert.throws(()=>f.read.parent(x.parent,A,"athlete"),/PROGRESSION_PERMISSION_REQUIRED/);assert.equal(f.read.athlete(x.athlete,A).readOnly,true);assert.throws(()=>f.xp.submitCoach(x.athlete,{organizationId:A,athleteId:"athlete",sourceEventId:"self",lane:"honor",amount:5,source:"self"}),/ROLE_DENIED/);});
test("persistence reconstructs balances and rejects tampered XP references",()=>{const f=setup(),x=flow(f,A);f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"strength",lane:"strength",amount:10,source:"structured-strength"});const restarted=new PersistentJsonCommercialStore(f.file);assert.equal(restarted.get("progressionCycles",A,"cycle-assignment").activeXp,10);const data=JSON.parse(readFileSync(f.file,"utf8"));data.xpEvents[0].athleteId="missing";writeFileSync(f.file,JSON.stringify(data));assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_XP_EVENT/);});
test("suspended organizations deny curriculum and XP operations",()=>{const f=setup(),x=flow(f,A);f.foundation.suspendOrganization(f.identity.mint("root",A,true),A);assert.throws(()=>f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"x",lane:"honor",amount:5,source:"verified"}),/ORGANIZATION_INACTIVE/);});
test("failed ledger write rolls back event and cycle together",()=>{const f=setup(),x=flow(f,A);const original=f.store.put.bind(f.store),cycle=f.store.get("progressionCycles",A,"cycle-assignment");f.store.put=(kind,record,replace)=>{if(kind==="progressionCycles"&&replace)throw new Error("INJECTED_WRITE_FAILURE");return original(kind,record,replace);};assert.throws(()=>f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"rollback",lane:"strength",amount:10,source:"structured-strength"}),/INJECTED/);f.store.put=original;assert.equal(f.store.get("xpEvents",A,"rollback"),undefined);assert.deepEqual(f.store.get("progressionCycles",A,"cycle-assignment"),cycle);});

test("promotion fails closed without independently persisted required skill approval",()=>{
  const f=setup(),x=flow(f,A);
  f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"threshold",amount:800,reason:"fixture"});
  assert.throws(()=>f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"promotion",requirementsVerified:true}),/PROMOTION_EVIDENCE_UNVERIFIED/);
  f.curriculum.evaluate(x.coach,{id:"introduced",organizationId:A,assignmentId:"assignment",athleteId:"athlete",skillId:"stance",status:"introduced"});
  assert.throws(()=>f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"promotion",requirementsVerified:true}),/PROMOTION_EVIDENCE_UNVERIFIED/);
  assert.equal(f.store.list("promotions",A).length,0);
});
test("revoked curriculum assignment cannot accept Coach skill evaluations",()=>{
  const f=setup(),x=flow(f,A);
  const assignment=f.store.get("curriculumAssignments",A,"assignment");
  f.store.put("curriculumAssignments",{...assignment,state:"revoked"},true);
  assert.throws(()=>f.curriculum.evaluate(x.coach,{id:"invalid",organizationId:A,assignmentId:"assignment",athleteId:"athlete",skillId:"stance",status:"approved"}),/INVALID_SKILL_EVALUATION/);
  assert.equal(f.store.list("skillEvaluations",A).length,0);
});
test("Coach XP rejects unapproved source strings even at allowed award amount",()=>{
  const f=setup(),x=flow(f,A);
  assert.throws(()=>f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"forged-source",lane:"strength",amount:10,source:"client"}),/UNVERIFIED_XP_SOURCE/);
  assert.equal(f.store.list("xpEvents",A).length,0);
});
test("restart rejects tampered cycle balances, event rank/athlete, and promotion history",()=>{
  const f=setup(),x=flow(f,A);
  f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"threshold",amount:800,reason:"fixture"});
  f.curriculum.evaluate(x.coach,{id:"required",organizationId:A,assignmentId:"assignment",athleteId:"athlete",skillId:"stance",status:"approved"});
  f.xp.promote(x.admin,{organizationId:A,athleteId:"athlete",promotionId:"p1",requirementsVerified:true});
  f.xp.submitCoach(x.coach,{organizationId:A,athleteId:"athlete",sourceEventId:"next-rank",lane:"strength",amount:10,source:"structured-strength"});
  const original=JSON.parse(readFileSync(f.file,"utf8"));
  const tamper=(mutate)=>{const data=structuredClone(original);mutate(data);writeFileSync(f.file,JSON.stringify(data));assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED/);};
  tamper(data=>data.progressionCycles[0].activeXp+=5);
  tamper(data=>data.progressionCycles[0].lifetimeXp+=10);
  tamper(data=>data.xpEvents[0].rankIndexAtAward=1);
  tamper(data=>data.promotions[0].historicalXpAtPromotion-=5);
  tamper(data=>data.promotions[0].toRank="champion");
  tamper(data=>data.xpEvents[0].athleteId="another");
  writeFileSync(f.file,JSON.stringify(original));
  assert.doesNotThrow(()=>new PersistentJsonCommercialStore(f.file));
});

test("negative Management adjustments cannot reduce XP below an earned stripe floor",()=>{
  const f=setup(),x=flow(f,A);
  f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"stripe-gain",amount:400,reason:"synthetic fixture"});
  assert.equal(f.read.athlete(x.athlete,A).earnedStripes,2);
  assert.throws(()=>f.xp.adjust(x.admin,{organizationId:A,athleteId:"athlete",sourceEventId:"stripe-loss",amount:-250,reason:"attempted reduction"}),/EARNED_STRIPE_FLOOR_PROTECTED/);
  assert.equal(f.store.get("progressionCycles",A,"cycle-assignment").activeXp,400);
  assert.equal(f.store.get("xpEvents",A,"stripe-loss"),undefined);
  assert.doesNotThrow(()=>new PersistentJsonCommercialStore(f.file));
});

test("Commercial rejects unapproved disciplines, empty core concepts, and modified rank standards",()=>{
  const f=setup(),admin=f.admin(A),baseline=definition(A);
  for(const [index,invalid] of [
    {...baseline,discipline:"brazilian_jiu_jitsu"},
    {...baseline,discipline:"submission_grappling"},
    {...baseline,skills:[{id:"bonus",category:"optional",name:"Bonus",required:false}]},
    {...baseline,skills:[]},
    {...baseline,ranks:baseline.ranks.map((rank,i)=>i===4?{...rank,requiredXp:rank.requiredXp+100}:rank)}
  ].entries()){
    assert.throws(()=>f.curriculum.createDefinition(admin,{...invalid,id:`invalid-${index}`}),/INVALID_OR_UNVERIFIED_CURRICULUM/);
  }
  assert.equal(f.store.list("curricula",A).length,0);
});
test("Coach-custom concepts preserve the Sandman rank standard",()=>{
  const f=setup(),admin=f.admin(A),custom=definition(A);
  custom.skills.push({id:"coach-setup",category:"coach_custom",name:"Custom setup technique",required:false});
  const created=f.curriculum.createDefinition(admin,custom);
  assert.equal(created.skills.length,2);
  assert.deepEqual(created.ranks,ROAD2CHAMPION_RANKS);
});
test("Assignment fails closed when a locally injected curriculum bypasses approved discipline validation",()=>{
  const f=setup(),admin=f.admin(A);
  f.family.registerAthlete(admin,{id:"transfer-protected",organizationId:A,academyId:"academy",locationId:"location",programId:"program",displayName:"Synthetic Athlete",synthetic:true,participationState:"active",adult:false});
  f.store.put("curricula",{...definition(A),discipline:"brazilian_jiu_jitsu"});
  assert.throws(()=>f.curriculum.assign(admin,{id:"bad-assignment",organizationId:A,athleteId:"transfer-protected",curriculumId:"curriculum",state:"active"}),/INVALID_CURRICULUM_ASSIGNMENT/);
  assert.equal(f.store.list("progressionCycles",A).length,0);
});
