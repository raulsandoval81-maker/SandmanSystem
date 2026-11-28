import test from "node:test";
import assert from "node:assert/strict";
import { prepareGroupSkillAssessment } from "../../public/coaches/logs/group-skill-assessment-policy.mjs";

const group = { athleteIds: ["F8_01", "F8_02", "F8_03"], checkedInIds: ["F8_01", "F8_02", "F8_03"], familyId: "double_leg", defaultStage: "APPLIED" };

test("group default with individual downgrade, upgrade, and exclusion stays draft-only", () => {
  const result = prepareGroupSkillAssessment({
    ...group, exceptions: { F8_02: "LEARNED", F8_03: "MASTERED" },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.observations.map(x => x.proposedStage), ["APPLIED", "LEARNED", "MASTERED"]);
  assert.equal(result.skillVerified, false);
  assert.equal(result.xpAwarded, false);
  assert.equal(result.autoEligible, false);
  assert.equal(result.draftOnly, true);
});
test("unassessed athlete can be excluded without manufacturing a skill observation", () => {
  const result = prepareGroupSkillAssessment({...group, excludedIds: ["F8_02"]});
  assert.deepEqual(result.observations.map(x => x.athleteId), ["F8_01", "F8_03"]);
  assert.deepEqual(result.excludedAthleteIds, ["F8_02"]);
});
test("rejects nonattendance, duplicate membership, and out-of-group exceptions", () => {
  assert.equal(prepareGroupSkillAssessment({...group, checkedInIds: ["F8_01"]}).ok, false);
  assert.equal(prepareGroupSkillAssessment({...group, athleteIds: ["F8_01", "F8_01"]}).ok, false);
  assert.equal(prepareGroupSkillAssessment({...group, exceptions: { F8_99: "MASTERED" }}).ok, false);
});
test("rejects invalid stages, including unrecognized individual overrides", () => {
  assert.equal(prepareGroupSkillAssessment({...group, defaultStage: "PROMOTED"}).ok, false);
  assert.equal(prepareGroupSkillAssessment({...group, exceptions: {F8_01: "PROMOTED"}}).ok, false);
});
