import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../functions/src/modules/skillCheckCoachCall.ts", import.meta.url), "utf8");

test("protected assembly action reuses accepted evidence and server recommendation logic", () => {
  assert.match(source, /action === "preview-auto-lesson-assembly"/);
  assert.match(source, /review\.status !== "ACCEPTED_HISTORICAL_EVIDENCE"/);
  assert.match(source, /previewMixedGroupSkillNeeds\(groupMembers, requested\)/);
  assert.match(source, /selectSupervisedGroupLesson\(groupPreview, recentFamilies\)/);
  assert.match(source, /buildProtectedAutoLessonAssemblySource/);
});

test("server owns athlete identity, rank, Journey, evidence provenance, and tracks", () => {
  assert.match(source, /const memberSnap = await db\.doc\(`athletes\/\$\{id\}`\)\.get\(\)/);
  assert.match(source, /tier: clean\(member\.tier \|\| member\.progressionTier\)/);
  assert.match(source, /journey: clean\(member\.journey \|\| member\.program \|\| member\.track\)/);
  assert.match(source, /track: member\.track/);
  assert.match(source, /manifestId: profile\?\.manifestId/);
});

test("client group selectors cannot add or duplicate an athlete", () => {
  assert.match(source, /group\.athleteIds\.some\(id => !ids\.includes\(id\)\)/);
  assert.match(source, /new Set\(requestedGroups\.flatMap\(group => group\.athleteIds\)\)\.size !== ids\.length/);
});

test("preview path contains no practice, XP, mastery, promotion, or execution write", () => {
  const branch = source.slice(source.indexOf('if \(action === "preview-auto-lesson-assembly"\)'.replaceAll("\\", "")), source.indexOf("return {ok: true, diagnosticOnly"));
  assert.doesNotMatch(branch, /tx\.(create|set|update)|\.set\(|\.update\(|FieldValue\.increment/);
  assert.doesNotMatch(branch, /openPractice|awardXp|promot|mastery|lessonExecuted/);
});
