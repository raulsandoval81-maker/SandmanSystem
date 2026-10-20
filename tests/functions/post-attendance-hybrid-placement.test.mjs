import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = p => readFileSync(path.join(root, p), "utf8");
const attendanceHtml = file("public/coaches/attendance/session.html");
const attendanceJs = file("public/coaches/attendance/session.js");
const attendanceCss = file("public/coaches/attendance/attendance.css");
const planning = file("public/coaches/attendance/hybrid-group-planning.js");
const builder = file("public/coaches/execution/session-builder/session-builder.js");

test("HYBRID selections appear after checked-in training groups, not on entry", () => {
  assert.ok(attendanceHtml.indexOf('id="postAttendanceHybridPlanning"') > attendanceHtml.indexOf('id="trainingGroups"'));
  assert.match(attendanceJs, /renderAttendanceHybridPlanning\(host, captureTrainingGroups\(\), hybridStageState/);
  assert.match(builder, /hybridPlanningPanel.hidden = !reviewingCheckedInPlan/);
  assert.match(builder, /get\("planning"\) === "1"/);
});

test("Attendance retains Practice Operations navigation and Stage IV stays primary", () => {
  assert.match(attendanceHtml, /class="attendance-header"/);
  assert.match(attendanceHtml, /← Practice Operations/);
  assert.match(attendanceHtml, /<h1 id="attendanceTitle">Athlete Check-In<\/h1>/);
  assert.match(attendanceHtml, /<h1 class="attendance-workflow-heading">Practice Groups<\/h1>/);
});

test("Stage IV keeps compact responsive group editors and the acknowledged Group D limit", () => {
  assert.match(attendanceJs, /class="training-group-editor"/);
  assert.match(attendanceJs, /NORMAL_TRAINING_GROUP_CAPACITY/);
  assert.match(attendanceJs, /Add Group D only when compatibility or instructional separation requires it/);
  assert.match(attendanceHtml, /id="fourGroupAcknowledgement"/);
  assert.match(attendanceCss, /@media\(max-width:720px\)/);
  assert.match(attendanceCss, /\.hybrid-planning-group-head\{align-items:flex-start;flex-direction:column\}/);
});

test("Group-specific choices persist to the matching practice's Session Builder record", () => {
  assert.match(attendanceJs, /planningSources: hybridStageState.planningSources/);
  assert.match(attendanceJs, /groupPlanning: Object.fromEntries\(trainingGroups.map/);
  assert.match(attendanceJs, /practiceId: activePractice\?\.practiceId/);
  assert.match(attendanceJs, /selectedWave: String\(priorPlanning.instructionalTier/);
  assert.match(planning, /resolveRoad2ChampionWrestlingTierWaves\(eligibility.tier\)/);
  assert.match(builder, /trainingGroups\.slice\(0, 4\)/);
});

test("System Suggestions remain unavailable and selections carry no mastery evidence", () => {
  assert.match(planning, /unavailable pending authoritative history/i);
  assert.match(planning, /never verified progression, XP, certification, or promotion evidence/);
  assert.doesNotMatch(planning, /promoteTier|updateDoc|setDoc|issueCertificate/);
});

test("HYBRID sources are expandable without creating pre-practice Pass It Forward evidence", () => {
  assert.match(planning, /<details class="hybrid-source-section"/);
  assert.match(planning, /expandedSources/);
  assert.match(planning, /Pass It Forward is recorded after practice/);
  assert.match(planning, /tierWaveEligibility\(group\)/);
  assert.match(planning, /No substitute curriculum was selected/);
  assert.doesNotMatch(planning, /updateDoc|setDoc|promoteTier|issueCertificate/);
});

test("all planning modes retain canonical attendance and groups outside HYBRID-only planning", () => {
  assert.match(attendanceJs, /localStorage\.setItem\("sandman_training_groups_v1", JSON\.stringify\(trainingGroups\)\)/);
  assert.match(attendanceJs, /practiceId: activePractice\?\.practiceId \|\| session\.practiceId/);
  assert.match(attendanceJs, /\.{3}\(isHybridPractice\(\) \? \{/);
  assert.match(attendanceJs, /planningSources: hybridStageState\.planningSources/);
  assert.match(attendanceJs, /carryForwardNote: primary\.carryForwardNote/);
});

test("Practice Groups transition never silently strands Coach on attendance review", () => {
  const start = attendanceJs.indexOf("function preparePracticeContext()");
  const end = attendanceJs.indexOf("async function savePracticeContextToBuilderSession()", start);
  const transition = attendanceJs.slice(start, end);
  assert.match(transition, /showStep\(4\);\s*try\s*\{\s*renderTrainingGroups\(groups\)/);
  assert.match(transition, /Practice Groups suggestion failed/);
  assert.match(transition, /Practice Groups rendering failed/);
  assert.match(transition, /setPracticeContextStatus\(/);
});

test("HYBRID fallback is opt-in and four-group submission honors the visible Coach approval", () => {
  const start = attendanceJs.indexOf("async function savePracticeContextToBuilderSession()");
  const end = attendanceJs.indexOf("function todayLabel()", start);
  const save = attendanceJs.slice(start, end);
  assert.match(save, /tierWaves: false,\s*systemSuggestions: false,\s*coachInput: false/);
  assert.doesNotMatch(save, /tierWaves: true,\s*systemSuggestions: true,\s*coachInput: true/);
  const submit = attendanceJs.slice(attendanceJs.indexOf("async function submitForReview()"));
  assert.match(submit, /fourGroupExceptionAcknowledged = \$\("fourGroupAcknowledgement"\)\?\.checked === true/);
});

test("four-group validation distinguishes missing acknowledgment from missing focus", () => {
  assert.match(attendanceJs, /fourGroupAcknowledgementRequired && !fourGroupExceptionAcknowledged/);
  assert.match(attendanceJs, /fourGroupExceptionAcknowledged \|\|= acknowledgement\.checked === true/);
  assert.match(attendanceJs, /acknowledgement\.checked = fourGroupExceptionAcknowledged/);
});

test("legacy HYBRID source selections do not override the OFF default", () => {
  assert.match(attendanceJs, /planningSourcesExplicitlySelected === true \? \(remembered\.planningSources \|\| \{\}\)/);
  assert.match(attendanceJs, /planningSourcesExplicitlySelected: hybridStageState\.planningSourcesExplicitlySelected === true/);
  assert.match(attendanceJs, /hybridStageState\.planningSourcesExplicitlySelected = false/);
});

test("Practice Groups presents progress and context as readable per-group summaries", () => {
  assert.match(attendanceJs, /progress\.replaceChildren\(\)/);
  assert.match(attendanceJs, /attendance-group-overview-item/);
  assert.match(attendanceJs, /attendance-context-overview-item/);
  assert.match(attendanceJs, /Focus not confirmed/);
  assert.doesNotMatch(attendanceJs.slice(attendanceJs.indexOf("function updateCompositionBanners("), attendanceJs.indexOf("function preparePracticeContext()")), /Skill Card evidence required/);
  assert.match(attendanceCss, /\.attendance-group-overview/);
  assert.match(attendanceCss, /\.attendance-context-overview/);
});

test("four-group validation distinguishes missing acknowledgment from missing focus", () => {
  assert.match(attendanceJs, /fourGroupAcknowledgementRequired && !fourGroupExceptionAcknowledged/);
  assert.match(attendanceJs, /fourGroupExceptionAcknowledged \|\|= acknowledgement\.checked === true/);
  assert.match(attendanceJs, /acknowledgement\.checked = fourGroupExceptionAcknowledged/);
});

test("legacy HYBRID source selections do not override the OFF default", () => {
  assert.match(attendanceJs, /planningSourcesExplicitlySelected === true \? \(remembered\.planningSources \|\| \{\}\)/);
  assert.match(attendanceJs, /planningSourcesExplicitlySelected: hybridStageState\.planningSourcesExplicitlySelected === true/);
  assert.match(attendanceJs, /hybridStageState\.planningSourcesExplicitlySelected = false/);
});

test("Practice Groups displays one safely escaped athlete per bullet", () => {
  assert.match(attendanceJs, /training-group-name-list/);
  assert.match(attendanceJs, /group\.athleteNames\.map\(name =>/);
  assert.match(attendanceJs, /escapeAttendance\(name\)/);
  assert.doesNotMatch(attendanceJs, /group\.athleteNames\.join\(", "\)/);
  assert.match(attendanceCss, /list-style:disc outside/);
});

test("Attendance hands off valid groups without demanding instructional focus", () => {
  const submit = attendanceJs.slice(attendanceJs.indexOf("async function submitForReview()"));
  assert.match(submit, /requireFocus: false/);
  const save = attendanceJs.slice(attendanceJs.indexOf("async function savePracticeContextToBuilderSession()"), attendanceJs.indexOf("function todayLabel()"));
  assert.match(save, /requireFocus: false/);
  assert.match(submit, /fourGroupAcknowledged: fourGroupExceptionAcknowledged/);
});
