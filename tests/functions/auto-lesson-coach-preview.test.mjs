import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root = new URL("../../", import.meta.url);
async function browserModule(path, replacements = []) {
  let source = await readFile(new URL(path, root), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}
const model = await browserModule("public/assets/js/auto/auto-lesson-coach-preview-model.js");
let assemblySource = await readFile(new URL("public/assets/js/auto/auto-lesson-assembly-preview.js", root), "utf8");
assemblySource = assemblySource.replaceAll('from "/coaches/', `from "${new URL("public/coaches/", root).href}`)
  .replaceAll('from "/assets/', `from "${new URL("public/assets/", root).href}`);
const {assembleServerLessonPreview} = await import(`data:text/javascript,${encodeURIComponent(assemblySource)}`);
const {DEMONSTRATION_SOURCE} = await browserModule("public/coaches/auto-lesson-preview/demo-fixture.js");

const protectedSource = recommendations => ({
  contractVersion: "skill-check-auto-preview-v1", issuedBy: "skillCheckCoachCall",
  discipline: "wrestling", journey: "p2l", sourceEvidenceAccepted: true,
  reviewStatus: "COACH_REVIEW_REQUIRED", authorizationStatus: "DIAGNOSTIC_ONLY",
  previewOnly: true, authoritative: false, eligibleForAuto: false, coachApprovalRequired: true,
  blockers: ["curriculum-policy-not-approved"], recommendations,
});
const rec = (groupId, tier, familyId, track, athleteId) => ({
  groupId, tier, familyId, instructionalPurpose: `Server reason for ${familyId}`,
  evidenceComplete: true, athletes: [{athleteId, track, currentState: null}],
  evidenceProvenance: [{athleteId, manifestId: `manifest-${athleteId}`, reviewRevision: 2,
    status: "ACCEPTED_HISTORICAL_EVIDENCE"}],
});
const makeState = () => model.createCoachPreviewState(assembleServerLessonPreview(protectedSource([
  rec("Group A", "t0", "setups_ties", "INTRODUCE", "A1"),
  rec("Group B", "t1", "setups_ties", "PRACTICE", "B1"),
  rec("Group C", "t2", "underhook", "EXTEND", "C1"),
])));

test("protected preview retains room, card, purpose, group, athlete, and evidence display data", () => {
  const state = makeState();
  assert.equal(state.segments.length, 2);
  assert.equal(state.segments[0].shared, true);
  assert.equal(state.segments[0].variations.length, 2);
  assert.match(state.segments[0].variations[0].card.href, /p2l-wrestling\/t0/);
  assert.equal(state.segments[0].variations[0].instructionalPurpose, "Server reason for setups_ties");
  assert.equal(state.original.sourceEvidenceAccepted, true);
});

test("demonstration fixture is unambiguously labeled and never claims verified evidence", async () => {
  const html = await readFile(new URL("public/coaches/auto-lesson-preview/index.html", root), "utf8");
  const fixture = JSON.stringify(DEMONSTRATION_SOURCE);
  assert.match(html, /DEMONSTRATION FIXTURE/);
  assert.match(html, /not verified athlete evidence/i);
  assert.match(fixture, /demonstration-fixture-not-verified-evidence/);
  assert.doesNotMatch(fixture, /ACCEPTED_HISTORICAL_EVIDENCE/);
});

test("shared instruction is represented once with distinct immutable group variations", () => {
  const state = makeState();
  const setups = state.segments.filter(item => item.familyId === "setups_ties");
  assert.equal(setups.length, 1);
  assert.deepEqual(setups[0].variations.map(item => item.groupId), ["Group A", "Group B"]);
  assert.deepEqual(setups[0].variations.flatMap(item => item.athletes.map(a => a.track)), ["INTRODUCE", "PRACTICE"]);
});

test("Coach reordering changes only the adjusted segment order", () => {
  const before = makeState();
  const firstId = before.segments[0].id;
  const after = model.reorderCoachSegment(before, firstId, "down");
  assert.notEqual(after.segments[0].id, firstId);
  assert.deepEqual(after.original, before.original);
});

test("valid minute and inclusion adjustments remain local", () => {
  const before = makeState();
  const id = before.segments[0].id;
  const timed = model.setCoachSegmentMinutes(before, id, 10);
  const excluded = model.setCoachSegmentIncluded(timed, id, false);
  assert.equal(timed.segments[0].proposedMinutes, 10);
  assert.equal(excluded.segments[0].included, false);
  assert.equal(excluded.original.segments[0].proposedMinutes, 8);
  assert.equal(excluded.original.segments[0].variations[0].athletes[0].track, "INTRODUCE");
});

test("invalid timing is rejected against the existing block capacity", () => {
  const before = makeState();
  const id = before.segments[0].id;
  const after = model.setCoachSegmentMinutes(before, id, 16);
  assert.equal(after.segments[0].proposedMinutes, before.segments[0].proposedMinutes);
  assert.deepEqual(after.adjustmentErrors, [`capacity-exceeded:technique:16:15`]);
});

test("client cannot invent a tied alternative", () => {
  const state = makeState();
  assert.throws(() => model.chooseTrustedAlternative(state, state.segments[0].id, "client-family"),
    /not supplied by the trusted preview source/);
});

test("restore returns the exact original proposal and clears errors", () => {
  const before = makeState();
  let changed = model.reorderCoachSegment(before, before.segments[0].id, "down");
  changed = model.setCoachSegmentIncluded(changed, changed.segments[0].id, false);
  const restored = model.restoreCoachProposal(changed);
  assert.deepEqual(restored.segments.map(s => s.familyId), before.segments.map(s => s.familyId));
  assert.ok(restored.segments.every(s => s.included));
  assert.deepEqual(restored.adjustmentErrors, []);
});

test("source blockers remain immutable and visible after adjustments", async () => {
  const state = makeState();
  const after = model.setCoachSegmentMinutes(state, state.segments[0].id, 10);
  assert.deepEqual(after.original.blockers, ["curriculum-policy-not-approved"]);
  const ui = await readFile(new URL("public/coaches/auto-lesson-preview/preview.js", root), "utf8");
  assert.match(ui, /p\.blockers/);
  assert.match(ui, /Blockers and required review/);
});

test("forged launch fields produce no lesson and cannot enable AUTO", () => {
  const forged = assembleServerLessonPreview({...protectedSource([
    rec("Group A", "t0", "setups_ties", "INTRODUCE", "A1")]),
    authorizationStatus: "AUTO_AUTHORIZED", authoritative: true, eligibleForAuto: true,
    coachApprovalRequired: false,
  });
  assert.deepEqual(forged.segments, []);
  assert.equal(forged.eligibleForAuto, false);
  assert.ok(forged.blockers.includes("forged-or-inconsistent-authorization-status"));
});

test("preview interface has no Firestore write or practice-launch capability", async () => {
  const files = await Promise.all([
    "public/coaches/auto-lesson-preview/preview.js",
    "public/assets/js/auto/auto-lesson-coach-preview-model.js",
  ].map(path => readFile(new URL(path, root), "utf8")));
  const source = files.join("\n");
  for (const forbidden of ["setDoc(", "updateDoc(", "addDoc(", "deleteDoc(", "openPracticeSession",
    "savePractice", "incrementXp", "promoteTier", "finalizeAttendance"]) assert.doesNotMatch(source, new RegExp(forbidden.replace("(", "\\(")));
  assert.doesNotMatch(source, /httpsCallable|firebase-init/);
});

test("the preview route is isolated and absent from production navigation", async () => {
  const html = await readFile(new URL("public/coaches/auto-lesson-preview/index.html", root), "utf8");
  assert.doesNotMatch(html, /coach-shell|session-builder|clipboard|big-clock|closeout/i);
  assert.match(html, /does not save, approve, create, execute, or award anything/i);
});
