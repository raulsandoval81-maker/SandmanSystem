const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileHistoryPages, previewMixedGroupSkillNeeds, selectSupervisedGroupLesson, evaluateGroupLessonPrerequisites, reviewSupervisedPrerequisiteSelection, auditCurriculumPrerequisiteGraph, reviewTrackReadiness, WRESTLING_REVIEW_GRAPH, WRESTLING_SUPPORTING_SKILLS, reviewWrestlingDependencyRoles, PILOT_WRESTLING_PREREQUISITES } = require("../lib/modules/historicalSkillReconciliation");

const athleteId = "F8_0001";
const discipline = "wrestling";
const observation = (state = "LEARNED") => ({
  familyId: "double_leg", state, coachUid: "coach-a",
  verifiedAt: "2026-10-01T18:00:00.000Z"
});
const practice = (id, date, state) => ({
  practiceId: id, sessionDateKey: date,
  verifiedSkills: [observation(state)]
});
const page = (scope, cursor, nextCursor, history, scopeExhausted = !nextCursor) => ({
  athleteId, discipline, scope, cursor, nextCursor,
  scopeExhausted, history
});
const assess = (pages, scopes = ["athlete-location"]) =>
  reconcileHistoryPages(pages, scopes, athleteId, discipline);

test("multi-page chain does not report a false cursor cycle", () => {
  const result = assess([
    page("athlete-location", null, "last-practice-1", [practice("p1", "2026-10-01", "LEARNED")], false),
    page("athlete-location", "last-practice-1", null, [practice("p2", "2026-10-02", "APPLIED")], true)
  ]);
  assert.equal(result.practices.length, 2);
  assert.equal(result.blockers.some(x => x.startsWith("cursor-cycle")), false);
  assert.deepEqual(result.skillTimelines[0].observations.map(x => x.state), ["LEARNED", "APPLIED"]);
  assert.equal(result.eligibleForAuto, false);
});

test("missing continuation page is a blocker", () => {
  const result = assess([page("athlete-location", null, "next", [practice("p1", "2026-10-01")], false)]);
  assert.ok(result.blockers.includes("missing-page:athlete-location"));
  assert.equal(result.coverageComplete, false);
});

test("scope overlap deduplicates identical practice", () => {
  const item = practice("p1", "2026-10-01");
  const result = assess([
    page("coach", null, null, [item]),
    page("athlete-location", null, null, [item]),
  ], ["coach", "athlete-location"]);
  assert.equal(result.practices.length, 1);
  assert.equal(result.blockers.includes("conflicting-duplicate-practice"), false);
});

test("conflicting duplicate practice blocks evidence readiness", () => {
  const result = assess([
    page("coach", null, null, [practice("p1", "2026-10-01", "LEARNED")]),
    page("athlete-location", null, null, [practice("p1", "2026-10-01", "MASTERED")]),
  ], ["coach", "athlete-location"]);
  assert.ok(result.blockers.includes("conflicting-duplicate-practice"));
  assert.equal(result.eligibleForAuto, false);
});

test("missing verification timestamp is not treated as complete evidence", () => {
  const item = practice("p1", "2026-10-01");
  item.verifiedSkills[0].verifiedAt = null;
  const result = assess([page("athlete-location", null, null, [item])]);
  assert.ok(result.blockers.includes("incomplete-verified-skill-observation"));
  assert.equal(result.coverageComplete, false);
});

test("invalid calendar dates are rejected", () => {
  const result = assess([page("athlete-location", null, null, [practice("p1", "2026-02-30")])]);
  assert.ok(result.blockers.includes("invalid-practice-date"));
  assert.equal(result.practices.length, 0);
});

test("even a complete visible chain never authorizes AUTO", () => {
  const result = assess([page("athlete-location", null, null, [practice("p1", "2026-10-01", "MASTERED")])]);
  assert.equal(result.coverageComplete, false);
  assert.equal(result.eligibleForAuto, false);
  assert.equal(result.skillTimelines[0].currentState, null);
});

test("cursor cycle is reported without mistaking it for a missing page", () => {
  const result = assess([
    page("athlete-location", null, "repeat", [practice("p1", "2026-10-01")], false),
    page("athlete-location", "repeat", "repeat", [practice("p2", "2026-10-02")], false),
  ]);
  assert.ok(result.blockers.includes("cursor-cycle:athlete-location"));
  assert.equal(result.eligibleForAuto, false);
});

test("unavailable required scope produces an explicit missing-page blocker", () => {
  const result = assess([
    page("coach", null, null, [practice("p1", "2026-10-01")]),
  ], ["coach", "athlete-location"]);
  assert.ok(result.blockers.includes("missing-page:athlete-location"));
  assert.equal(result.coverageComplete, false);
});

test("duplicate page cursor is flagged even if evidence agrees", () => {
  const same = page("athlete-location", null, null, [practice("p1", "2026-10-01")]);
  const result = assess([same, same]);
  assert.ok(result.blockers.includes("duplicate-page-cursor"));
  assert.equal(result.eligibleForAuto, false);
});

test("missing page evidence is distinct from a pagination cycle", () => {
  const incomplete = page("athlete-location", null, null, []);
  delete incomplete.history;
  const result = assess([incomplete]);
  assert.ok(result.blockers.includes("missing-evidence:athlete-location"));
  assert.equal(result.blockers.some(x => x.startsWith("cursor-cycle")), false);
});

test("verification timestamp before practice date blocks chronology", () => {
  const item = practice("p1", "2026-10-09");
  item.verifiedSkills[0].verifiedAt = "2026-10-08T18:00:00.000Z";
  const result = assess([page("athlete-location", null, null, [item])]);
  assert.ok(result.blockers.includes("verification-predates-practice"));
  assert.equal(result.eligibleForAuto, false);
});

test("later verification of a prior practice remains valid evidence", () => {
  const item = practice("p1", "2026-10-01");
  item.verifiedSkills[0].verifiedAt = "2026-10-09T18:00:00.000Z";
  const result = assess([page("athlete-location", null, null, [item])]);
  assert.equal(result.blockers.includes("verification-predates-practice"), false);
  assert.equal(result.coverageComplete, false);
});

test("mixed-group preview gives shared skill with introduction, practice and extension tracks",()=>{
 const result=previewMixedGroupSkillNeeds([
  {athleteId:"beginner",approved:true,blockers:[],skills:[]},
  {athleteId:"developing",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"LEARNED"}]},
  {athleteId:"advanced",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"MASTERED"}]},
 ],["double_leg"]);
 assert.equal(result.ready,true);
 assert.equal(result.eligibleForAuto,false);
 assert.equal(result.coachReviewRequired,true);
 assert.deepEqual(result.lessonCandidates[0].members.map(x=>x.track),["INTRODUCE","PRACTICE","EXTEND"]);
});
test("mixed-group preview denies unapproved evidence, conflicts and duplicates",()=>{
 const result=previewMixedGroupSkillNeeds([
  {athleteId:"a",approved:false,blockers:["historical-review-pending"],skills:[]},
  {athleteId:"a",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"UNKNOWN"}]},
 ],["double_leg"]);
 assert.equal(result.ready,false);
 assert.deepEqual(result.lessonCandidates,[]);
 assert.equal(result.eligibleForAuto,false);
 assert.ok(result.blockers.includes("duplicate-or-missing-athlete"));
 assert.ok(result.blockers.includes("athlete-evidence-not-ready:a"));
});

test("Coach practice lesson workspace parses as JavaScript module and exposes protected workflow",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const {spawnSync}=require("node:child_process");
 const html=fs.readFileSync(path.resolve(__dirname,"../../public/coaches/practice/group-lessons.html"),"utf8");
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code,"Expected Coach lesson workspace module");
 const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:code,encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 for(const action of ["preview-group-lessons","create-recommended-group-lesson-draft",
   "save-group-lesson-draft","confirm-group-lesson-draft",
   "attach-group-lesson-to-practice","record-group-lesson-delivery"]) {
   assert.ok(code.includes(action),"Missing Coach operation: "+action);
 }
 assert.ok(html.includes('href="/coaches/practice/"'));
});

test("Coach review preserves pre-save adjustments and locks practice after attachment",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const html=fs.readFileSync(path.resolve(__dirname,"../../public/coaches/practice/group-lessons.html"),"utf8");
 assert.match(html,/const coachSelectedTracks=tracks\(\)/);
 assert.match(html,/save-group-lesson-draft",\{lessonId,familyId,tracks:coachSelectedTracks\}/);
 assert.match(html,/\$\("practiceId"\)\.readOnly=true/);
 assert.match(html,/\$\("delivered"\)\.value=roster\.join/);
});

test("Coach must persist track edits before confirming, and can start a new lesson",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.resolve(__dirname,"../../public/coaches/practice/group-lessons.html"),"utf8");
 assert.match(html,/if\(hasUnsavedTracks\(\)\)/);
 assert.match(html,/Save Coach adjustments before confirming/);
 assert.match(html,/function rememberTracks\(\)/);
 assert.match(html,/id="newLesson"/);
 assert.match(html,/newLesson"\)\.onclick/);
});

test("Supervised AUTO selects dominant verified group need without executing",()=>{
 const group=previewMixedGroupSkillNeeds([
  {athleteId:"A",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"NOT_INTRODUCED"},{familyId:"single_leg",state:"MASTERED"}]},
  {athleteId:"B",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"LEARNED"},{familyId:"single_leg",state:"MASTERED"}]},
 ],["double_leg","single_leg"]);
 const auto=selectSupervisedGroupLesson(group);
 assert.equal(auto.ready,true);
 assert.equal(auto.selection.familyId,"double_leg");
 assert.equal(auto.coachApprovalRequired,true);
 assert.equal(auto.eligibleForAuto,false);
});
test("Supervised AUTO refuses ties and incomplete evidence",()=>{
 const tied=previewMixedGroupSkillNeeds([
  {athleteId:"A",approved:true,blockers:[],skills:[]}
 ],["double_leg","single_leg"]);
 assert.deepEqual(selectSupervisedGroupLesson(tied).blockers,["multiple-equivalent-lessons"]);
 const blocked=previewMixedGroupSkillNeeds([
  {athleteId:"A",approved:false,blockers:["missing"],skills:[]}
 ],["double_leg"]);
 assert.equal(selectSupervisedGroupLesson(blocked).ready,false);
 assert.equal(selectSupervisedGroupLesson(blocked).selection,null);
});

test("Coach UI displays suggested skill without bypassing review or confirmation",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.resolve(__dirname,"../../public/coaches/practice/group-lessons.html"),"utf8");
 assert.match(html,/list\.value=supervised\.selection\.familyId/);
 assert.match(html,/Coach review and confirmation required/);
 assert.match(html,/if\(hasUnsavedTracks\(\)\)/);
 assert.match(html,/confirm-group-lesson-draft/);
 assert.match(html,/eligibleForAuto|AUTO and XP remain unchanged/);
});

test("Supervised lesson rotation skips recently delivered families and fails closed if all were taught",()=>{
 const preview=previewMixedGroupSkillNeeds([
  {athleteId:"A",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"NOT_INTRODUCED"},{familyId:"single_leg",state:"MASTERED"}]},
  {athleteId:"B",approved:true,blockers:[],skills:[{familyId:"double_leg",state:"LEARNED"},{familyId:"single_leg",state:"MASTERED"}]},
 ],["double_leg","single_leg"]);
 const rotated=selectSupervisedGroupLesson(preview,["double_leg"]);
 assert.equal(rotated.ready,true);
 assert.equal(rotated.selection.familyId,"single_leg");
 const blocked=selectSupervisedGroupLesson(preview,["double_leg","single_leg"]);
 assert.equal(blocked.ready,false);
 assert.deepEqual(blocked.blockers,["all-candidates-recently-delivered"]);
 assert.equal(blocked.eligibleForAuto,false);
});

test("Draft curriculum prerequisites identify individual foundation gaps without granting AUTO",()=>{
 const result=evaluateGroupLessonPrerequisites([
  {athleteId:"A",approved:true,blockers:[],skills:[{familyId:"stance_motion",state:"LEARNED"},{familyId:"level_change_entry",state:"LEARNED"}]},
  {athleteId:"B",approved:true,blockers:[],skills:[{familyId:"stance_motion",state:"LEARNED"}]},
 ],["double_leg","stance_motion","chain_wrestling"],PILOT_WRESTLING_PREREQUISITES);
 assert.deepEqual(result.byFamily.double_leg.missing,[{athleteId:"B",prerequisite:"level_change_entry"}]);
 assert.equal(result.byFamily.stance_motion.ready,true);
 assert.ok(result.blockers.includes("prerequisite-policy-unconfigured:chain_wrestling"));
 assert.equal(result.policyApproved,false);
 assert.equal(result.eligibleForAuto,false);
});

test("Unapproved prerequisites block AUTO and show a foundational Coach alternative",()=>{
 const athletes=[
  {athleteId:"A",approved:true,blockers:[],skills:[{familyId:"stance_motion",state:"LEARNED"}]},
  {athleteId:"B",approved:true,blockers:[],skills:[{familyId:"stance_motion",state:"NOT_INTRODUCED"}]},
 ];
 const preview=previewMixedGroupSkillNeeds(athletes,["double_leg","level_change_entry","stance_motion"]);
 const evaluation=evaluateGroupLessonPrerequisites(athletes,
   ["double_leg","level_change_entry","stance_motion"],PILOT_WRESTLING_PREREQUISITES);
 const result=reviewSupervisedPrerequisiteSelection(preview,evaluation);
 assert.equal(result.ready,false);
 assert.equal(result.selection,null);
 assert.equal(result.suggestedFoundation,"stance_motion");
 assert.ok(result.blockers.includes("prerequisites-not-met-or-unconfigured:double_leg"));
 assert.equal(result.eligibleForAuto,false);
});

test("Curriculum map audit exposes missing coverage and refuses cycles",()=>{
 const draft=auditCurriculumPrerequisiteGraph(["stance_motion","level_change_entry","double_leg","single_leg","chain_wrestling"],PILOT_WRESTLING_PREREQUISITES);
 assert.equal(draft.structurallyValid,true);
 assert.deepEqual(draft.unmappedFamilies,["chain_wrestling"]);
 assert.equal(draft.policyApproved,false);
 assert.equal(draft.eligibleForAuto,false);
 const invalid=auditCurriculumPrerequisiteGraph(["a","b"],{a:["b"],b:["a"]});
 assert.equal(invalid.structurallyValid,false);
 assert.ok(invalid.issues.some(issue=>issue.startsWith("dependency-cycle:")));
});

test("Instructional readiness distinguishes introduction, practice and extension",()=>{
 const result=reviewTrackReadiness([
  {athleteId:"A",approved:true,blockers:[],skills:[]},
  {athleteId:"B",approved:true,blockers:[],skills:[{familyId:"foundation",state:"LEARNED"}]},
  {athleteId:"C",approved:true,blockers:[],skills:[{familyId:"foundation",state:"APPLIED"}]},
  {athleteId:"D",approved:false,blockers:["unverified"],skills:[{familyId:"foundation",state:"MASTERED"}]},
 ],"next_family",["foundation"]);
 assert.deepEqual(result.athletes.map(x=>[x.introduce,x.practice,x.extend]),
   [[true,false,false],[true,true,false],[true,true,true],[false,false,false]]);
 assert.deepEqual(result.athletes[0].missingForPractice,["foundation"]);
 assert.equal(result.policyApproved,false);
 assert.equal(result.eligibleForAuto,false);
});

test("Coach lesson workspace displays provisional readiness for each instructional track",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.resolve(__dirname,"../../public/coaches/practice/group-lessons.html"),"utf8");
 assert.match(html,/result\.trackReadiness\|\|\[\]/);
 assert.match(html,/renderReadiness\(\)/);
 assert.match(html,/Coach review only/);
 assert.match(html,/Prerequisite policy is not configured/);
 assert.match(html,/Introduce","Practice","Extend/);
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 const {spawnSync}=require("node:child_process");
 const check=spawnSync(process.execPath,["--input-type=module","--check"],{input:code,encoding:"utf8"});
 assert.equal(check.status,0,check.stderr);
});

test("Wrestling proposal distinguishes mandatory foundations from supporting skills",()=>{
 const review=reviewWrestlingDependencyRoles(WRESTLING_REVIEW_GRAPH,WRESTLING_SUPPORTING_SKILLS);
 assert.deepEqual(review.issues,[]);
 assert.equal(review.entries.length,36);
 const chain=review.entries.find(item=>item.familyId==="chain_wrestling");
 assert.deepEqual(chain.mandatoryFoundations,["double_leg"]);
 assert.deepEqual(chain.supportingSkills,["single_leg"]);
 assert.equal(review.policyApproved,false);
 assert.equal(review.eligibleForAuto,false);
});

test("Coach page renders distinct mandatory and supporting curriculum columns",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.resolve(__dirname,"../../public/coaches/practice/group-lessons.html"),"utf8");
 assert.match(html,/result\.dependencyRoleReview/);
 assert.match(html,/Proposed mandatory foundations/);
 assert.match(html,/Proposed supporting skills/);
 assert.match(html,/Neither role is approved for AUTO/);
 const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(module);
 const {spawnSync}=require("node:child_process");
 const checked=spawnSync(process.execPath,["--input-type=module","--check"],{input:module,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
});
