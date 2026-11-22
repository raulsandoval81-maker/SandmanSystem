const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CommercialFoundation, CurriculumService, InMemoryCommercialStore,
  InMemoryTestIdentityAuthority, OrganizationOnboardingService, ROAD2CHAMPION_RANKS
} = require("../lib");
const {CoachDashboard} = require("../lib/coachDashboard");

function setup() {
  const identity = new InMemoryTestIdentityAuthority();
  const store = new InMemoryCommercialStore();
  const foundation = new CommercialFoundation(store, identity);
  const org = "pilot-dev";
  new OrganizationOnboardingService(foundation).onboard(identity.mint("root",org,true), {
    organizationId:org, organizationName:"Synthetic Academy", academyId:"academy",
    academyName:"Test Academy", locationId:"room", locationName:"Training Room",
    programId:"wrestling", programName:"Youth Wrestling", disciplines:["wrestling"],
    administratorUserId:"owner", coachUserId:"coach", packageSource:"Core",
    capabilityIds:["schedule.manage","attendance.manage","coach.workspace"],
    startsAt:"2026-01-01T00:00:00Z", expiresAt:"2099-01-01T00:00:00Z"
  });
  const ownerCtx = identity.mint("owner",org);
  const coachCtx = identity.mint("coach",org);
  return {
    store, foundation, identity, org, ownerCtx, coachCtx,
    owner: new CoachDashboard(foundation,ownerCtx,identity.verify(ownerCtx)),
    coach: new CoachDashboard(foundation,coachCtx,identity.verify(coachCtx))
  };
}

test("owner assigns a scoped active coach when adding a synthetic athlete",()=>{
  const f=setup();
  f.owner.submit(new URLSearchParams({
    action:"athlete",name:"Synthetic Wrestler",group:"wrestling",location:"room",coach:"coach"
  }));
  const athlete=f.store.list("athletes",f.org)[0];
  assert.deepEqual(athlete.assignedCoachUserIds,["coach"]);
  assert.equal(f.coach.snapshot().athletes[0].id,athlete.id);
});

test("unassigned or ineligible coach cannot be used when adding an athlete",()=>{
  const f=setup();
  assert.throws(()=>f.owner.submit(new URLSearchParams({
    action:"athlete",name:"Synthetic Wrestler",group:"wrestling",location:"room",coach:"outsider"
  })),/COACH_NOT_ELIGIBLE_FOR_ASSIGNMENT/);
  assert.equal(f.store.list("athletes",f.org).length,0);
});

test("assigned coach awards validated XP through the Commercial dashboard without manager rights",()=>{
  const f=setup();
  f.owner.submit(new URLSearchParams({
    action:"athlete",name:"Synthetic Wrestler",group:"wrestling",location:"room",coach:"coach"
  }));
  const athlete=f.store.list("athletes",f.org)[0];
  const curriculum=new CurriculumService(f.foundation);
  curriculum.createDefinition(f.ownerCtx,{
    id:"own-curriculum", organizationId:f.org, academyId:"academy",
    discipline:"wrestling", version:"1.0.0", pathway:"road2champion",
    ranks:[...ROAD2CHAMPION_RANKS], state:"active",
    skills:[{id:"stance",category:"foundation",name:"Stance",required:true}]
  });
  curriculum.assign(f.ownerCtx,{
    id:"assignment",organizationId:f.org,athleteId:athlete.id,
    curriculumId:"own-curriculum",state:"active"
  });
  assert.throws(()=>f.coach.submit(new URLSearchParams({
    action:"coach-xp",athlete:athlete.id,award:"strength:999"
  })),/UNAPPROVED_XP_AMOUNT/);
  f.coach.submit(new URLSearchParams({
    action:"coach-xp",athlete:athlete.id,award:"strength:10",reason:"Verified training"
  }));
  const view=f.coach.snapshot();
  assert.equal(view.progression[0].activeXp,10);
  assert.equal(view.xpHistory.length,1);
  assert.equal(view.xpHistory[0].lane,"strength");
  assert.equal(view.xpHistory[0].reason,"Verified training");
  assert.throws(()=>f.owner.submit(new URLSearchParams({
    action:"coach-xp",athlete:athlete.id,award:"strength:10"
  })),/COACH_NOT_ASSIGNED/);
});
