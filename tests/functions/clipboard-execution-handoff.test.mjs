import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compilePracticeTimeline,
  normalizePracticeBlock
} from "../../public/coaches/execution/engine/practice-execution-contract.mjs";

test("Clipboard validates execution before canonical practice opening", () => {
  const clipboard = readFileSync(new URL("../../public/coaches/execution/clipboard-2.0/clipboard-2.0.js", import.meta.url), "utf8");
  assert.match(clipboard, /compilePracticeTimeline\(\{ blocks \}\)/);
  assert.ok(clipboard.indexOf("const executionTimeline = compilePracticeTimeline") < clipboard.indexOf("const openPractice = httpsCallable"));
  assert.match(clipboard, /if \(!executionTimeline\.valid\)/);
  assert.match(clipboard, /executionContract,/);
});
test("Clipboard carries card references and explicit interval semantics", () => {
  const block = normalizePracticeBlock({
    slot: "technique", title: "Double Leg", minutes: 3,
    cards: [{id:"double-leg",title:"Double Leg"}],
    timer: {pack:"Combat",preset:"Rounds", execution:{
      rounds: 2,workSeconds:60,restSeconds:30,linkedSkillIds:["double-leg"]
    }}
  });
  assert.equal(block.timer.execution.linkedSkillIds[0], "double-leg");
  assert.equal(block.cards[0].title,"Double Leg");
  assert.equal(compilePracticeTimeline({blocks:[{
    slot:block.id,title:block.title,minutes:3,cards:block.cards,
    timer:block.timer
  }]}).valid,true);
});
test("Rejects interval/drill conflicts with no executable events", () => {
  const timeline=compilePracticeTimeline({blocks:[{
    slot:"live",minutes:2,timer:{execution:{rounds:2,workSeconds:45,restSeconds:15}},
    drillBlocks:[{id:"d1",name:"Partner",minutes:1}]
  }]});
  assert.equal(timeline.valid,false);
  assert.equal(timeline.errors[0].code,"CONFLICTING_TIMER_AND_DRILLS");
  assert.deepEqual(timeline.events,[]);
});
test("Rejects over-allocation with no executable events", () => {
  const timeline=compilePracticeTimeline({blocks:[{
    slot:"live",minutes:1,timer:{execution:{rounds:2,workSeconds:45,restSeconds:15}}
  }]});
  assert.equal(timeline.valid,false);
  assert.ok(timeline.errors.some(e=>e.code==="OVER_ALLOCATED"));
  assert.deepEqual(timeline.events,[]);
});
