const test=require("node:test");
const assert=require("node:assert/strict");
const {renderCoachDashboard}=require("../lib/coachDashboardView");
const {commercialStyles}=require("../lib/commercialStyles");

const fixture=()=>({
  organization:{id:"synthetic-dev",displayName:"Sandman Pilot <Academy>",state:"active"},
  programs:[{id:"team-1",name:"Varsity Wrestling",disciplines:["wrestling"],state:"active",locationIds:["room-1"],academyId:"a-1"}],
  athletes:[{id:"ath-1",displayName:"Test <Athlete>",programId:"team-1",locationId:"room-1",participationState:"active"}],
  sessions:[{id:"s-1",programId:"team-1",locationId:"room-1",startsAt:"2099-01-01T17:00:00Z",endsAt:"2099-01-01T18:00:00Z",state:"scheduled"}],
  attendance:[],notes:[],events:[],activity:[],locations:[{id:"room-1",name:"Pilot Room"}],coaches:["synthetic-coach"],
  canManageOrganization:true,canSchedule:true,canRecordAttendance:true,canWriteNotes:true
});

test("commercial coach workspace renders safe responsive overview, roster and workflow anchors",()=>{
  const html=renderCoachDashboard(fixture(),"csrf-synthetic",null);
  for(const name of ["Coach workspace","Coach checklist","Athlete roster","Practice &amp; attendance","Events and competitions","Activity history","Organization settings"])assert.ok(html.includes(name),name);
  for(const anchor of ['id="overview"','id="roster"','id="groups"','id="sessions"','id="events"','id="activity"','id="settings"'])assert.ok(html.includes(anchor),anchor);
  assert.match(html,/dashboard-grid/);
  assert.match(html,/data-list/);
  assert.ok(html.includes("Sandman Pilot &lt;Academy&gt;"));
  assert.ok(html.includes("Test &lt;Athlete&gt;"));
  assert.ok(!html.includes("Test <Athlete>"));
  assert.ok(html.includes('name="csrf" value="csrf-synthetic"'));
  assert.match(commercialStyles,/@media\(max-width:650px\)/);
  assert.match(commercialStyles,/focus-visible/);
});

test("athlete profile is permission-scoped and escapes user-provided text",()=>{
  const view=fixture();
  const profile=renderCoachDashboard(view,"csrf-synthetic","ath-1");
  assert.match(profile,/Attendance history/);
  assert.match(profile,/Back to roster/);
  assert.ok(profile.includes("Test &lt;Athlete&gt;"));
  assert.throws(()=>renderCoachDashboard(view,"csrf-synthetic","ath-not-visible"),/ATHLETE_NOT_FOUND/);
});

test("coach-only workspace displays no organization-management forms",()=>{
  const view=fixture();view.canManageOrganization=false;view.locations=[];view.coaches=[];view.canSchedule=false;
  const html=renderCoachDashboard(view,"csrf",null);
  assert.ok(!html.includes("Add synthetic athlete"));
  assert.ok(!html.includes("Add training group"));
  assert.ok(!html.includes('name="action" value="settings"'));
  assert.ok(html.includes('name="action" value="attendance"'));
});
