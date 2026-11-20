const test=require("node:test"),assert=require("node:assert/strict");const{mkdtempSync,readFileSync,writeFileSync}=require("node:fs"),{tmpdir}=require("node:os"),{join}=require("node:path");
const{AthleteAccessService,AttendanceService,CoachService,CommercialFoundation,FamilyRelationshipService,InMemoryTestIdentityAuthority,OrganizationOnboardingService,ParentHubService,PersistentJsonCommercialStore,SchedulingService}=require("../lib");
const A="family-alpha",B="family-beta",now=()=>new Date("2026-11-20T20:00:00Z");
const onboarding=org=>({organizationId:org,organizationName:org,academyId:"academy-local",academyName:"Academy",locationId:"location-local",locationName:"Gym",programId:"program-local",programName:"Wrestling",disciplines:["wrestling"],administratorUserId:`admin-${org}`,coachUserId:`coach-${org}`,packageSource:"Plus",capabilityIds:["schedule.manage","attendance.manage","coach.workspace"],startsAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"});
const practice=org=>({id:"session-local",organizationId:org,academyId:"academy-local",locationId:"location-local",programId:"program-local",coachUserIds:[`coach-${org}`],startsAt:"2026-11-21T18:00:00Z",endsAt:"2026-11-21T19:00:00Z",state:"scheduled"});
function setup(){const file=join(mkdtempSync(join(tmpdir(),"sandman-family-")),"store.json"),identity=new InMemoryTestIdentityAuthority(),store=new PersistentJsonCommercialStore(file),foundation=new CommercialFoundation(store,identity,now),onboard=new OrganizationOnboardingService(foundation),family=new FamilyRelationshipService(foundation),parent=new ParentHubService(foundation),athleteAccess=new AthleteAccessService(foundation),schedule=new SchedulingService(foundation),attendance=new AttendanceService(foundation,now),coach=new CoachService(foundation,schedule);for(const org of[A,B])onboard.onboard(identity.mint("root",org,true),onboarding(org));return{file,identity,store,foundation,family,parent,athleteAccess,schedule,attendance,coach,adminA:identity.mint(`admin-${A}`,A),adminB:identity.mint(`admin-${B}`,B),coachA:identity.mint(`coach-${A}`,A)};}
function familyFlow(f,org,admin){f.family.registerAthlete(admin,{id:"athlete-local",organizationId:org,academyId:"academy-local",locationId:"location-local",programId:"program-local",displayName:"Synthetic Minor",synthetic:true,participationState:"active",adult:false,assignedCoachUserIds:[`coach-${org}`]});f.family.registerGuardian(admin,{id:"guardian-local",organizationId:org,userId:`guardian-user-${org}`,displayName:"Synthetic Guardian",state:"active",synthetic:true});f.foundation.assignMembership(admin,{id:"member-parent",organizationId:org,userId:`guardian-user-${org}`,role:"parent",scopeType:"organization",scopeId:org,state:"active"});f.family.linkGuardian(admin,{id:"family-link",organizationId:org,guardianId:"guardian-local",athleteId:"athlete-local",state:"active",permissions:["profile","schedule","attendance"]});f.foundation.assignMembership(admin,{id:"member-athlete",organizationId:org,userId:`athlete-user-${org}`,role:"athlete",scopeType:"organization",scopeId:org,state:"active"});f.family.linkAthleteIdentity(admin,{id:"identity-link",organizationId:org,userId:`athlete-user-${org}`,athleteId:"athlete-local",state:"active",access:"minor_read_only"});f.schedule.create(admin,practice(org));const coach=f.identity.mint(`coach-${org}`,org);f.attendance.record(coach,org,"session-local","athlete-local","present");return{parent:f.identity.mint(`guardian-user-${org}`,org),athlete:f.identity.mint(`athlete-user-${org}`,org)};}

test("two tenants complete Management Coach Parent Hub and Athlete OS flow",()=>{const f=setup(),a=familyFlow(f,A,f.adminA),b=familyFlow(f,B,f.adminB);assert.equal(f.parent.overview(a.parent,A).athletes.length,1);assert.equal(f.parent.overview(b.parent,B).athletes.length,1);assert.equal(f.athleteAccess.self(a.athlete,A).attendance.length,1);assert.equal(f.store.athletes.size,2);});
test("guardian sees only explicitly linked athlete and not an unlinked sibling",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);f.family.registerAthlete(f.adminA,{id:"sibling",organizationId:A,programId:"program-local",displayName:"Sibling",synthetic:true,participationState:"active",adult:false});const result=f.parent.overview(access.parent,A);assert.deepEqual(result.athletes.map(x=>x.athlete.id),["athlete-local"]);});
test("guardian cannot claim athlete or cross tenant",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);assert.throws(()=>f.family.linkGuardian(access.parent,{id:"claim",organizationId:A,guardianId:"guardian-local",athleteId:"athlete-local",state:"active",permissions:["profile"]}),/ROLE_DENIED/);assert.throws(()=>f.parent.overview(access.parent,B),/TENANT_BOUNDARY_DENIED/);});
test("guardian revocation immediately denies and survives restart",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);f.family.revokeGuardian(f.adminA,A,"family-link");assert.throws(()=>f.parent.overview(access.parent,A),/GUARDIAN_RELATIONSHIP_REQUIRED/);const restarted=new PersistentJsonCommercialStore(f.file);assert.equal(restarted.get("guardianLinks",A,"family-link").state,"revoked");});
test("athlete sees only own read-only records",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);const self=f.athleteAccess.self(access.athlete,A);assert.equal(self.athlete.id,"athlete-local");assert.equal(self.readOnly,true);assert.throws(()=>f.athleteAccess.self(f.identity.mint("outsider",A),A),/MEMBERSHIP_REQUIRED/);});
test("adult athlete self access and minor access distinctions are enforced",()=>{const f=setup();f.family.registerAthlete(f.adminA,{id:"adult",organizationId:A,programId:"program-local",displayName:"Synthetic Adult",synthetic:true,participationState:"active",adult:true});f.foundation.assignMembership(f.adminA,{id:"adult-member",organizationId:A,userId:"adult-user",role:"adult_athlete",scopeType:"organization",scopeId:A,state:"active"});f.family.linkAthleteIdentity(f.adminA,{id:"adult-link",organizationId:A,userId:"adult-user",athleteId:"adult",state:"active",access:"adult_self"});assert.equal(f.athleteAccess.self(f.identity.mint("adult-user",A),A).athlete.id,"adult");assert.throws(()=>f.family.linkAthleteIdentity(f.adminA,{id:"wrong",organizationId:A,userId:"x",athleteId:"adult",state:"active",access:"minor_read_only"}),/INVALID_ATHLETE_IDENTITY_LINK/);});
test("revoked athlete identity fails independently of guardian access",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);const link=f.store.get("athleteIdentityLinks",A,"identity-link");f.store.put("athleteIdentityLinks",{...link,state:"revoked"},true);assert.throws(()=>f.athleteAccess.self(access.athlete,A),/ATHLETE_ACCESS_REQUIRED/);assert.equal(f.parent.overview(access.parent,A).athletes.length,1);});
test("restart preserves family access and rejects cross-tenant persisted links",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);assert.equal(new PersistentJsonCommercialStore(f.file).list("guardianLinks",A).length,1);const data=JSON.parse(readFileSync(f.file,"utf8"));data.guardianLinks[0].athleteId="missing";writeFileSync(f.file,JSON.stringify(data));assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_GUARDIAN_LINK/);});
test("forged sessions and parent privilege escalation fail closed",()=>{const f=setup();familyFlow(f,A,f.adminA);assert.throws(()=>f.parent.overview({sessionId:"forged"},A),/UNVERIFIED_IDENTITY/);const p=f.identity.mint(`guardian-user-${A}`,A);assert.throws(()=>f.foundation.assignMembership(p,{id:"elevate",organizationId:A,userId:`guardian-user-${A}`,role:"organization_admin",scopeType:"organization",scopeId:A,state:"active"}),/ROLE_DENIED/);});
test("family services do not modify XP billing curriculum or practice notes",()=>{const f=setup(),beforeNotes=f.store.practiceNotes.size;familyFlow(f,A,f.adminA);assert.equal(f.store.practiceNotes.size,beforeNotes);for(const athlete of f.store.athletes.values()){assert.equal("xp" in athlete,false);assert.equal("rank" in athlete,false);assert.equal("billing" in athlete,false);}});
test("coach roster is limited to assigned athletes in the authorized program",()=>{const f=setup();familyFlow(f,A,f.adminA);f.family.registerAthlete(f.adminA,{id:"unassigned",organizationId:A,programId:"program-local",displayName:"Unassigned",synthetic:true,participationState:"active",adult:false,assignedCoachUserIds:[]});assert.deepEqual(f.family.coachRoster(f.coachA,A,"program-local").map(a=>a.id),["athlete-local"]);});
test("revoked Parent membership denies an otherwise active family link",()=>{const f=setup(),access=familyFlow(f,A,f.adminA);f.foundation.revokeMembership(f.adminA,A,"member-parent");assert.throws(()=>f.parent.overview(access.parent,A),/MEMBERSHIP_REQUIRED/);});
test("failed relationship validation preserves links and records only its rejection audit",()=>{const f=setup();familyFlow(f,A,f.adminA);const before=f.store.guardianLinks.size;assert.throws(()=>f.family.linkGuardian(f.adminA,{id:"invalid-link",organizationId:A,guardianId:"guardian-local",athleteId:"missing",state:"active",permissions:["profile"]}),/INVALID_FAMILY_OWNERSHIP/);assert.equal(f.store.guardianLinks.size,before);assert.equal(f.store.get("guardianLinks",A,"invalid-link"),undefined);const restarted=new PersistentJsonCommercialStore(f.file);assert.equal(restarted.get("guardianLinks",A,"invalid-link"),undefined);assert.equal(restarted.audits.at(-1).outcome,"rejected");});

test("Parent Hub grants profile schedule and attendance separately without leaking full athlete data",()=>{
  for(const permission of ["profile","schedule","attendance"]){
    const f=setup(),access=familyFlow(f,A,f.adminA);
    const link=f.store.get("guardianLinks",A,"family-link");
    f.store.put("guardianLinks",{...link,permissions:[permission]},true);
    const item=f.parent.overview(access.parent,A).athletes[0];
    assert.equal(item.program!==undefined,permission==="profile");
    assert.equal(item.athlete!==undefined,permission==="profile");
    assert.equal(item.sessions.length,permission==="schedule"?1:0);
    assert.equal(item.attendance.length,permission==="attendance"?1:0);
    if(item.athlete){
      assert.deepEqual(Object.keys(item.athlete).sort(),["displayName","id","participationState"]);
      assert.equal("assignedCoachUserIds" in item.athlete,false);
    }
  }
});
test("guardian linkage rejects inactive profiles, duplicated permissions, invalid link states and unrelated scopes",()=>{
  const f=setup();familyFlow(f,A,f.adminA);
  const base={id:"new-link",organizationId:A,guardianId:"guardian-local",athleteId:"athlete-local",state:"active",permissions:["profile"]};
  const g=f.store.get("guardians",A,"guardian-local");
  f.store.put("guardians",{...g,state:"suspended"},true);
  assert.throws(()=>f.family.linkGuardian(f.adminA,base),/INVALID_FAMILY_OWNERSHIP/);
  f.store.put("guardians",g,true);
  assert.throws(()=>f.family.linkGuardian(f.adminA,{...base,permissions:["profile","profile"]}),/INVALID_FAMILY_OWNERSHIP/);
  assert.throws(()=>f.family.linkGuardian(f.adminA,{...base,permissions:["malicious"]}),/INVALID_FAMILY_OWNERSHIP/);
  assert.throws(()=>f.family.linkGuardian(f.adminA,{...base,state:"suspended"}),/INVALID_FAMILY_OWNERSHIP/);
  assert.equal(f.store.get("guardianLinks",A,"new-link"),undefined);
});
test("athlete identity creation rejects multiple active links for the same user",()=>{
  const f=setup();const access=familyFlow(f,A,f.adminA);
  assert.throws(()=>f.family.linkAthleteIdentity(f.adminA,{id:"duplicate-identity",organizationId:A,userId:`athlete-user-${A}`,athleteId:"athlete-local",state:"active",access:"minor_read_only"}),/INVALID_ATHLETE_IDENTITY_LINK/);
  assert.equal(f.athleteAccess.self(access.athlete,A).athlete.id,"athlete-local");
});
test("athlete self access fails closed if two active identity links exist in local fixture",()=>{
  const f=setup(),access=familyFlow(f,A,f.adminA);
  f.store.put("athleteIdentityLinks",{id:"forged-second",organizationId:A,userId:`athlete-user-${A}`,athleteId:"athlete-local",state:"active",access:"minor_read_only"});
  assert.throws(()=>f.athleteAccess.self(access.athlete,A),/AMBIGUOUS_ATHLETE_IDENTITY/);
});
test("restart rejects malformed guardian permissions and duplicate active athlete identities",()=>{
  const f=setup();familyFlow(f,A,f.adminA);
  const original=JSON.parse(readFileSync(f.file,"utf8"));
  const badPermissions=structuredClone(original);
  badPermissions.guardianLinks[0].permissions=["profile","forged"];
  writeFileSync(f.file,JSON.stringify(badPermissions));
  assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_GUARDIAN_LINK/);
  const dupPermissions=structuredClone(original);
  dupPermissions.guardianLinks[0].permissions=["profile","profile"];
  writeFileSync(f.file,JSON.stringify(dupPermissions));
  assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_GUARDIAN_LINK/);
  const suspendedGuardian=structuredClone(original);
  suspendedGuardian.guardians[0].state="suspended";
  writeFileSync(f.file,JSON.stringify(suspendedGuardian));
  assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_GUARDIAN_LINK/);
  const duplicateIdentity=structuredClone(original);
  duplicateIdentity.athleteIdentityLinks.push({...duplicateIdentity.athleteIdentityLinks[0],id:"duplicate"});
  writeFileSync(f.file,JSON.stringify(duplicateIdentity));
  assert.throws(()=>new PersistentJsonCommercialStore(f.file),/INVALID_PERSISTED_ATHLETE_IDENTITY/);
  writeFileSync(f.file,JSON.stringify(original));
  assert.doesNotThrow(()=>new PersistentJsonCommercialStore(f.file));
});
