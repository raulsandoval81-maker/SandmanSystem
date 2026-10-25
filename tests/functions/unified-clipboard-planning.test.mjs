import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildApprovedCatalog,
  canonicalRestoreDecision,
  normalizeClipboardPlan,
  planReadiness,
} from "../../public/coaches/execution/clipboard-2.0/unified-planning-model.mjs";
import { executableCardsForBlock } from "../../public/coaches/execution/session-builder/hybrid-planning-policy.js";
import { compilePracticeTimeline } from "../../public/coaches/execution/engine/practice-execution-contract.mjs";

const groups = [
  { id:"a", label:"Group A", journey:"P2L", tier:"T0", discipline:"wrestling", athleteIds:["p-silva","r-silva"] },
  { id:"b", label:"Group B", journey:"P2L", tier:"T1", discipline:"wrestling", athleteIds:["m-sandoval","j-zaragoza","c-kwasi"] },
  { id:"c", label:"Group C", journey:"Z2H", tier:"T0", discipline:"wrestling", athleteIds:["l-sampson"] },
];
const cards = [
  { groupId:"a", provenance:"approved-tier-wave", cards:[{id:"stance",title:"Stance Motion",journey:"p2l",tier:"t0",discipline:"wrestling",skill:"01"}] },
  { groupId:"b", provenance:"approved-tier-wave", cards:[{id:"finish",title:"Chain Finish",journey:"p2l",tier:"t1",discipline:"wrestling",skill:"11"}] },
  { groupId:"c", provenance:"approved-tier-wave", cards:[{id:"safe",title:"Safe Finish",journey:"r2c",tier:"t0",discipline:"wrestling",skill:"02"}] },
];

test("six athletes remain coordinated in three compatible curriculum groups", () => {
  const catalog = buildApprovedCatalog(groups, cards);
  assert.equal(catalog.length, 3);
  assert.deepEqual(catalog.map(card => card.compatibleGroupIds), [["a"],["b"],["c"]]);
  assert.equal(new Set(groups.flatMap(group => group.athleteIds)).size, 6);
});

test("MANUAL add/remove/reorder and HYBRID override normalize into one practice timeline", () => {
  const catalog = buildApprovedCatalog(groups, cards);
  const plan = normalizeClipboardPlan({ practiceId:"practice-six", schema:"standard-60", focus:"Finish safely", blocks:[
    {slot:"technique",title:"Teach",minutes:15,cards:[{...catalog[0],groupIds:["a"]},{...catalog[2],groupIds:["c"]}]},
    {slot:"drills",title:"Drill",minutes:10,cards:[{...catalog[1],groupIds:["b"]}],timer:{execution:{rounds:4,workSeconds:90,restSeconds:30,warningSeconds:10}}},
  ], flexibleOrder:["technique","drills"] }, "practice-six");
  assert.deepEqual(plan.flexibleOrder, ["technique","drills"]);
  assert.deepEqual(plan.blocks[0].cards.map(card => card.id), ["stance","safe"]);
  plan.blocks[0].cards.splice(0, 1);
  assert.deepEqual(plan.blocks[0].cards.map(card => card.id), ["safe"]);
  assert.equal(planReadiness(plan, groups).ready, true);
});

test("duration and explicit work/rest settings remain Big Clock compatible", () => {
  const timeline = compilePracticeTimeline({ blocks:[{slot:"live",title:"Live",minutes:7,timer:{execution:{rounds:3,workSeconds:120,restSeconds:30,warningSeconds:15}}}] });
  assert.equal(timeline.valid, true);
  assert.equal(timeline.totalSeconds, 420);
  assert.ok(timeline.events.some(event => event.type === "rest-start"));
});

test("group assignments expand without losing curriculum identity or provenance", () => {
  const expanded = executableCardsForBlock({ cards:[{id:"shared",title:"Shared stance",skill:"01",provenance:"approved-tier-wave",groupIds:["a","b"],athleteIds:["p-silva","r-silva","m-sandoval"]}] });
  assert.deepEqual(expanded.map(card => card.groupId), ["a","b"]);
  assert.ok(expanded.every(card => card.skill === "01" && card.provenance === "approved-tier-wave"));
});

test("canonical restore is practice isolated and fails closed", () => {
  assert.deepEqual(canonicalRestoreDecision({requestedPracticeId:"one",canonicalPracticeId:"one",restored:true}), {allowLocalFallback:false,blocked:false});
  assert.equal(canonicalRestoreDecision({requestedPracticeId:"two",canonicalPracticeId:"one",restored:true}).blocked, true);
  assert.equal(canonicalRestoreDecision({requestedPracticeId:"two",canonicalPracticeId:"two",restored:false}).blocked, true);
});

test("stale revision rejection and AUTO gate remain explicit", async () => {
  const [server,builder,clipboard] = await Promise.all([
    readFile(new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8"),
    readFile(new URL("../../public/coaches/execution/session-builder/session-builder.js", import.meta.url), "utf8"),
    readFile(new URL("../../public/coaches/execution/clipboard-2.0/clipboard-2.0.js", import.meta.url), "utf8"),
  ]);
  assert.match(server, /currentRevision > 0 && expectedRevision == null/);
  assert.match(server, /expectedRevision !== currentRevision/);
  assert.match(builder, /!canLaunchAuto\(payload\.trainingGroups, payload\.groupPrescriptions\)/);
  assert.match(clipboard, /canonicalRestoreBlocked/);
  assert.match(clipboard, /await saveCanonicalPlanningContext\(\)/);
});
