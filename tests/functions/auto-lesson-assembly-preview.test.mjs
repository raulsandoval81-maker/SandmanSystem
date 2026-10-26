import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const sourcePath = new URL("public/assets/js/auto/auto-lesson-assembly-preview.js", root);
let source = await readFile(sourcePath, "utf8");
source = source.replaceAll('from "/coaches/', `from "${new URL("public/coaches/", root).href}`)
  .replaceAll('from "/assets/', `from "${new URL("public/assets/", root).href}`);
const {assembleAutoLessonPreview, assembleServerLessonPreview} = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const athlete = (athleteId, track) => ({athleteId, track});
const recommendation = (groupId, tier, familyId, athletes, evidenceComplete = true) =>
  ({groupId, tier, familyId, athletes, evidenceComplete});
const assemble = recommendations => assembleAutoLessonPreview({
  discipline: "wrestling", journey: "p2l", schema: "academy-60", recommendations,
});

test("selects exact rank-specific Path2Legend cards from existing mappings", () => {
  const result = assemble([
    recommendation("apprentices", "T0", "setups_ties", [athlete("a0", "INTRODUCE")]),
    recommendation("warriors", "T1", "setups_ties", [athlete("a1", "PRACTICE")]),
    recommendation("heroes", "T2", "setups_ties", [athlete("a2", "EXTEND")]),
  ]);
  assert.deepEqual(result.segments.flatMap(s => s.variations).map(v => [v.tier, v.rankName, v.card.href]), [
    ["t0", "Apprentice", "/coaches/cards/teen/p2l-wrestling/t0/skill-07-setups.html"],
    ["t1", "Warrior", "/coaches/cards/teen/p2l-wrestling/t1/skill-05-setups-control-ties.html"],
    ["t2", "Hero", "/coaches/cards/teen/p2l-wrestling/t2/skill-08-setups-system.html"],
  ]);
});

test("rejects families without a verified card mapping and incomplete evidence", () => {
  const result = assemble([
    recommendation("g1", "t0", "not_a_family", [athlete("a1", "INTRODUCE")]),
    recommendation("g2", "t1", "double_leg", [athlete("a2", "PRACTICE")], false),
  ]);
  assert.deepEqual(result.segments, []);
  assert.ok(result.blockers.includes("missing-family-mapping:g1:not_a_family"));
  assert.ok(result.blockers.includes("incomplete-evidence:g2:double_leg"));
});

test("preserves athlete-specific tracks while consolidating compatible shared families", () => {
  const result = assemble([
    recommendation("g1", "t0", "setups_ties", [athlete("a1", "INTRODUCE")]),
    recommendation("g2", "t1", "setups_ties", [athlete("a2", "PRACTICE")]),
  ]);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].shared, true);
  assert.deepEqual(result.segments[0].variations.flatMap(v => v.athletes), [
    athlete("a1", "INTRODUCE"), athlete("a2", "PRACTICE"),
  ]);
});

test("keeps incompatible INTRODUCE and EXTEND needs separate", () => {
  const result = assemble([
    recommendation("g1", "t0", "setups_ties", [athlete("a1", "INTRODUCE")]),
    recommendation("g2", "t2", "setups_ties", [athlete("a2", "EXTEND")]),
  ]);
  assert.equal(result.segments.length, 2);
  assert.ok(result.segments.every(segment => !segment.shared));
});

test("fits proposals inside the existing schema or returns an explicit time blocker", () => {
  const fits = assemble([recommendation("g1", "t0", "double_leg", [athlete("a1", "INTRODUCE")])]);
  assert.equal(fits.durationMinutes, 60);
  assert.equal(fits.blockers.length, 0);
  const crowded = assemble([
    recommendation("g1", "t0", "double_leg", [athlete("a1", "INTRODUCE")]),
    recommendation("g2", "t0", "single_leg", [athlete("a2", "INTRODUCE")]),
  ]);
  assert.ok(crowded.blockers.includes("insufficient-time:technique:16:15"));
});

test("uses only existing supported execution lanes and never synthesizes an activity", () => {
  const result = assemble([
    recommendation("g1", "t1", "shot_defense", [athlete("a1", "PRACTICE")]),
    recommendation("g2", "t2", "underhook", [athlete("a2", "EXTEND")]),
  ]);
  assert.deepEqual(result.segments.map(segment => segment.blockId).sort(), ["drills", "live"]);
  assert.ok(result.segments.every(segment => segment.variations.every(variation => variation.card.href)));
});

test("output is non-authoritative and cannot enable AUTO", () => {
  const result = assemble([recommendation("g1", "t0", "double_leg", [athlete("a1", "PRACTICE")])]);
  assert.equal(result.authoritative, false);
  assert.equal(result.previewOnly, true);
  assert.equal(result.eligibleForAuto, false);
  assert.equal(result.evidenceCertifiedByAdapter, false);
  assert.equal(result.coachEditingRequired, true);
  assert.equal(result.coachApprovalRequired, true);
  assert.equal(result.timingPolicy, "PROPOSED_PREVIEW_POLICY");
});

const serverSource = recommendations => ({
  contractVersion: "skill-check-auto-preview-v1",
  issuedBy: "skillCheckCoachCall",
  discipline: "wrestling",
  journey: "p2l",
  sourceEvidenceAccepted: true,
  reviewStatus: "COACH_REVIEW_REQUIRED",
  authorizationStatus: "DIAGNOSTIC_ONLY",
  previewOnly: true,
  authoritative: false,
  eligibleForAuto: false,
  coachApprovalRequired: true,
  recommendations,
  blockers: [],
});

test("accepted protected source flows through the same assembly engine", () => {
  const result = assembleServerLessonPreview(serverSource([
    recommendation("g1", "t0", "setups_ties", [athlete("a1", "INTRODUCE")]),
    recommendation("g2", "t1", "setups_ties", [athlete("a2", "PRACTICE")]),
  ]));
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].shared, true);
  assert.equal(result.sourceAuthorizationStatus, "DIAGNOSTIC_ONLY");
  assert.equal(result.eligibleForAuto, false);
});

test("forged approval or recommendation-source status is rejected", () => {
  const forgedApproval = assembleServerLessonPreview({
    ...serverSource([recommendation("g1", "t0", "setups_ties", [athlete("a1", "INTRODUCE")])]),
    authorizationStatus: "AUTO_AUTHORIZED",
    coachApprovalRequired: false,
    eligibleForAuto: true,
  });
  const forgedSource = assembleServerLessonPreview({
    ...serverSource([]), issuedBy: "browser", sourceEvidenceAccepted: true,
  });
  assert.deepEqual(forgedApproval.segments, []);
  assert.ok(forgedApproval.blockers.includes("forged-or-inconsistent-authorization-status"));
  assert.ok(forgedSource.blockers.includes("untrusted-recommendation-source"));
});

test("source evidence blockers survive assembly without cards or side effects", () => {
  const result = assembleServerLessonPreview({
    ...serverSource([recommendation("g1", "t0", "setups_ties", [athlete("a1", "INTRODUCE")])]),
    sourceEvidenceAccepted: false,
    blockers: ["g1:athlete-evidence-not-ready:F4_A"],
  });
  assert.deepEqual(result.segments, []);
  assert.ok(result.blockers.includes("g1:athlete-evidence-not-ready:F4_A"));
  assert.equal(result.readyForCoachPreview, false);
});
