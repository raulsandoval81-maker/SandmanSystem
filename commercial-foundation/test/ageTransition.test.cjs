const test = require("node:test");
const assert = require("node:assert/strict");
const {previewAge14Transition} = require("../lib");

test("Road2Champion below age 14 is not transitioned",()=>{
  const result=previewAge14Transition({verifiedAgeYears:13,currentPathway:"road2champion",currentRank:"prospect"});
  assert.equal(result.decision,"not_due");
  assert.equal(result.destinationPathway,"road2champion");
  assert.equal(result.performsMutation,false);
});
test("age-14 youth transition starts at Apprentice unless Champion earned",()=>{
  for (const rank of ["shadow","prospect","competitor","contender"]) {
    const result=previewAge14Transition({verifiedAgeYears:14,currentPathway:"road2champion",currentRank:rank});
    assert.equal(result.decision,"transition_required");
    assert.equal(result.destinationRank,"apprentice");
    assert.equal(result.requiresVerifiedAssignment,true);
    assert.equal(result.preservesHistoricalAchievements,true);
  }
  const champion=previewAge14Transition({verifiedAgeYears:15,currentPathway:"road2champion",currentRank:"champion"});
  assert.equal(champion.destinationRank,"warrior");
});
test("verified coach exception may keep Champion but not another youth rank",()=>{
  const champion=previewAge14Transition({verifiedAgeYears:14,currentPathway:"road2champion",currentRank:"champion",verifiedCoachException:true});
  assert.equal(champion.decision,"coach_exception_approved");
  assert.equal(champion.destinationPathway,"road2champion");
  assert.equal(champion.requiresVerifiedAssignment,false);
  const prospect=previewAge14Transition({verifiedAgeYears:14,currentPathway:"road2champion",currentRank:"prospect",verifiedCoachException:true});
  assert.equal(prospect.destinationPathway,"path2legend");
  assert.equal(prospect.destinationRank,"apprentice");
});
test("invalid age, pathway, and rank fail closed",()=>{
  for(const age of [NaN,-1,14.5,121]) assert.throws(()=>previewAge14Transition({verifiedAgeYears:age,currentPathway:"road2champion",currentRank:"shadow"}),/INVALID_VERIFIED_AGE/);
  assert.throws(()=>previewAge14Transition({verifiedAgeYears:14,currentPathway:"road2champion",currentRank:"legend"}),/INVALID_CURRENT_RANK/);
  assert.throws(()=>previewAge14Transition({verifiedAgeYears:14,currentPathway:"forged",currentRank:"shadow"}),/INVALID_CURRENT_RANK/);
  assert.equal(previewAge14Transition({verifiedAgeYears:16,currentPathway:"path2legend",currentRank:"hero"}).decision,"not_due");
});
