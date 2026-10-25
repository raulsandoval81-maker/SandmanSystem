import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compilePracticeTimeline, getActiveCombatInterval } from "../../public/coaches/execution/engine/practice-execution-contract.mjs";

const block = compilePracticeTimeline({blocks:[{slot:"live",title:"Live",minutes:5,
  timer:{label:"Double Leg",execution:{rounds:2,workSeconds:120,restSeconds:30,warningSeconds:15,linkedSkillIds:["double-leg"]}}
}]}).blocks[0];

test("resolves work, rest, next round and completed interval without mutating the block clock", () => {
  assert.deepEqual(getActiveCombatInterval(block,0),{
    phase:"work",round:1,rounds:2,remainingSeconds:120,label:"Double Leg",linkedSkillIds:["double-leg"]
  });
  assert.equal(getActiveCombatInterval(block,120).phase,"rest");
  assert.equal(getActiveCombatInterval(block,149).remainingSeconds,1);
  assert.equal(getActiveCombatInterval(block,150).round,2);
  assert.equal(getActiveCombatInterval(block,270).phase,"complete");
});
test("legacy block has no combat interval and keeps existing Big Clock behavior", () => {
  assert.equal(getActiveCombatInterval({timer:{label:"Partner Drill"}},20),null);
});
test("Big Clock consumes contract as optional presentation state", () => {
  const src=readFileSync(new URL("../../public/coaches/execution/big-clock-2.0/big-clock-2.0.js",import.meta.url),"utf8");
  assert.match(src,/getActiveCombatInterval\(compiledBlock, elapsedForInterval\)/);
  assert.match(src,/getPayload\(\)\.executionContract/);
  assert.match(src,/timerLabel \|\| ""/);
});
