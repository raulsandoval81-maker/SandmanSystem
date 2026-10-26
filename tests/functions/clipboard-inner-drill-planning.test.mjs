import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path,root),"utf8");
const contractSource = await read("public/assets/js/practice/shared-inner-drill-contract.js");
const contract = await import(`data:text/javascript,${encodeURIComponent(contractSource)}`);
const manual = (kind,timer,overrides={}) => contract.createInnerDrill({
  id:`${kind}-1`,name:`Coach ${kind}`,kind,parentBlock:kind === "match" ? "live" : kind === "drill" ? "drills" : "live",
  discipline:"wrestling",practiceMode:"manual",origin:"coach",assignedGroupIds:[],
  instructionalPurpose:"Coach-created activity",goal:"Execute safely",cueLevel:"optimal",
  coachingCues:["Position"],flowCues:["Go"],timer,...overrides,
});

test("MANUAL creates Continuous, Drill, Live, and Match schedules with the shared contract", () => {
  const formats = [
    manual("drill",{type:"continuous",seconds:300}),
    manual("drill",{type:"interval",workSeconds:30,restSeconds:10,rounds:3}),
    manual("live",{type:"interval",workSeconds:120,restSeconds:30,rounds:3}),
    manual("match",{type:"match",periodSeconds:[180,120,120],periodBreakSeconds:0,
      matchCount:2,recoverySeconds:60,shortTimeSeconds:10}),
  ];
  assert.ok(formats.every(item=>item.contractVersion===contract.INNER_DRILL_CONTRACT_VERSION));
  assert.deepEqual(formats.map(item=>item.practiceMode),["manual","manual","manual","manual"]);
});

test("legacy drills remain valid without an innerDrill property", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");
  assert.match(clipboard,/if \(!timer\) return legacy/);
  assert.match(clipboard,/const inner = data\.innerDrill \|\| null/);
  assert.match(clipboard,/type === "none"/);
});

test("extended drills load, compile, and save below the existing namespaced property", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");
  assert.match(clipboard,/item\._innerDrillSource = data\.innerDrill/);
  assert.match(clipboard,/timingFromEditor\(item\)/);
  assert.match(clipboard,/toClipboardDrillBlock\(compiled\)/);
  assert.match(clipboard,/innerDrill:compiled/);
  assert.match(clipboard,/renderSavedDrillBlocks\(block, saved\.drillBlocks \|\| \[\]\)/);
});

test("editor exposes all timing controls and exact schedule display", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");
  for (const className of ["inner-drill-timing-type","inner-drill-continuous-seconds","inner-drill-work",
    "inner-drill-rest","inner-drill-rounds","inner-drill-live-format","inner-drill-rotation",
    "inner-drill-periods","inner-drill-period-break","inner-drill-match-count",
    "inner-drill-match-recovery","inner-drill-short-time"]) assert.match(clipboard,new RegExp(className));
  assert.match(clipboard,/Scheduled: \$\{formatExactDuration\(compiled\.scheduledSeconds\)\}/);
  assert.match(clipboard,/Reserved in parent block: \$\{compiled\.reservedMinutes\} whole min/);
});

test("exact seconds remain authoritative while legacy minutes reserve the ceiling", () => {
  const drill = manual("drill",{type:"interval",workSeconds:30,restSeconds:10,rounds:3});
  const clipboard = contract.toClipboardDrillBlock(drill);
  assert.equal(drill.scheduledSeconds,110);
  assert.equal(drill.minutes,110/60);
  assert.equal(drill.reservedMinutes,2);
  assert.equal(clipboard.minutes,2);
  assert.equal(clipboard.innerDrill.scheduledSeconds,110);
});

test("multiple drills validate exact capacity and whole-minute reservation", () => {
  const first = manual("drill",{type:"continuous",seconds:61});
  const second = manual("drill",{type:"continuous",seconds:61},{id:"drill-2"});
  const tooSmall = contract.validateInnerDrillBlock({parentMinutes:3,parentTimer:null,drills:[first,second]});
  assert.equal(tooSmall.scheduledSeconds,122);
  assert.equal(tooSmall.reservedMinutes,4);
  assert.ok(tooSmall.blockers.includes("parent-block-reservation-exceeded:4:3"));
  assert.equal(contract.validateInnerDrillBlock({parentMinutes:4,parentTimer:null,drills:[first,second]}).ok,true);
});

test("parent capacity, unsupported versions, and timer conflicts block persistence and launch", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");
  assert.match(clipboard,/function requireValidInnerDrills/);
  assert.match(clipboard,/function persistDraft[\s\S]*if \(!requireValidInnerDrills\(\)\) return null/);
  assert.match(clipboard,/window\.runPractice[\s\S]*requireValidInnerDrills\(\{forExecution:true\}\)/);
  assert.match(clipboard,/saveCurrentPlanToFirestore[\s\S]*requireValidInnerDrills\(\{forExecution:true\}\)/);
  assert.match(clipboard,/source\.contractVersion !== INNER_DRILL_CONTRACT_VERSION/);
  assert.match(clipboard,/parentTimer:\{pack:block\.dataset\.timerPack/);
});

test("AUTO, HYBRID, and MANUAL use the same editor without upgrading preview authorization", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");
  assert.match(clipboard,/\["auto","hybrid","manual"\]\.includes\(mode\)/);
  assert.match(clipboard,/origin:source\?\.origin \|\| "coach"/);
  assert.match(clipboard,/Preview-only recommendations cannot enter practice execution/);
  assert.doesNotMatch(clipboard,/manualInnerDrill|hybridInnerDrill|autoInnerDrill/);
});

test("Coach timing changes preserve the protected original and provenance", () => {
  const provenance = {previewOnly:true,authoritative:false,eligibleForAuto:false,manifestId:"m1"};
  const proposed = contract.createInnerDrill({
    ...manual("drill",{type:"interval",workSeconds:30,restSeconds:10,rounds:3}),
    practiceMode:"hybrid",origin:"server-suggestion",recommendationProvenance:provenance,
    skillProvenance:{familyId:"single_leg",mappingVersion:"p2l-v1"}
  });
  const changed = contract.overrideInnerDrillTiming(proposed,{type:"interval",workSeconds:45,restSeconds:15,rounds:3});
  assert.equal(changed.originalProposal.scheduledSeconds,110);
  assert.equal(changed.scheduledSeconds,165);
  assert.deepEqual(changed.recommendationProvenance,provenance);
  assert.deepEqual(changed.skillProvenance,proposed.skillProvenance);
});

test("Clipboard to Big Clock handoff remains the existing drillBlocks array", async () => {
  const [clipboard,clock,companion] = await Promise.all([
    read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js"),
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("public/coaches/execution/coach-companion/coach-companion.js")]);
  assert.match(clipboard,/drillBlocks:\s*captureDrillBlocks\(b\)/);
  assert.match(clock,/drillBlocks:\s*Array\.isArray\(b\.drillBlocks\)/);
  assert.match(companion,/drillBlocks:\s*Array\.isArray\(sourceBlock\?\.drillBlocks\)/);
  assert.doesNotMatch(clock,/innerDrill\.phases|scheduledSeconds/);
  assert.doesNotMatch(companion,/innerDrill\.phases|scheduledSeconds/);
});

test("planning integration adds no new production write or live timer runtime", async () => {
  assert.doesNotMatch(contractSource,/firebase-init|httpsCallable|setDoc\(|updateDoc\(|addDoc\(|setInterval\(/);
  assert.match(contractSource,/planningOnly: true/);
  assert.match(contractSource,/authoritative: false/);
  assert.match(contractSource,/eligibleForAuto: false/);
});
