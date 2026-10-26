import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const moduleUrl = new URL("public/assets/js/practice/shared-inner-drill-contract.js", root);
const source = await readFile(moduleUrl, "utf8");
const contract = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const diagnostic = Object.freeze({
  contractVersion:"skill-check-auto-preview-v1", previewOnly:true,
  authoritative:false, eligibleForAuto:false, evidenceManifestId:"manifest-1",
});
const base = (overrides = {}) => ({
  id:"drill-1", name:"Setups to single leg", kind:"drill", parentBlock:"drills",
  discipline:"wrestling", practiceMode:"manual", origin:"coach", skillFamily:"single_leg",
  coachCard:{id:"skill-08",href:"/coaches/cards/teen/p2l-wrestling/t1/skill-08-single-leg.html"},
  assignedGroupIds:["group-a"], instructionalPurpose:"Connect setups to a clean entry",
  goal:"Finish with posture", cueLevel:"optimal", coachingCues:["Head up","Hips in"],
  flowCues:["Go","Rotate"], timer:{type:"interval",workSeconds:30,restSeconds:10,rounds:3},
  skillProvenance:{familyId:"single_leg",mappingVersion:"wrestling-p2l"}, ...overrides,
});

test("drill work/rest/round compilation omits rest after the final round", () => {
  const drill = contract.createInnerDrill(base());
  assert.deepEqual(drill.phases.map(item => item.kind), ["work","rest","work","rest","work"]);
  assert.equal(drill.scheduledSeconds, 110);
  assert.equal(drill.phases.at(-1).round, 3);
});

test("continuous drills do not require interval timing", () => {
  const drill = contract.createInnerDrill(base({timer:{type:"continuous",seconds:420}}));
  assert.equal(drill.phases.length, 1);
  assert.equal(drill.scheduledSeconds, 420);
});

test("short, standard, and long live formats are editable timing templates", () => {
  assert.deepEqual(Object.keys(contract.WRESTLING_LIVE_FORMATS), ["short","standard","long"]);
  const totals = Object.values(contract.WRESTLING_LIVE_FORMATS).map(format =>
    contract.createInnerDrill(base({kind:"live",parentBlock:"live",name:format.label,
      timer:{type:"interval",...format}})).scheduledSeconds);
  assert.deepEqual(totals, [255, 870, 1020]);
  const changed = contract.overrideInnerDrillTiming(contract.createInnerDrill(base({kind:"live",parentBlock:"live"})),
    {type:"interval",workSeconds:45,restSeconds:15,rounds:4});
  assert.equal(changed.scheduledSeconds, 225);
  assert.equal(changed.coachOverride, true);
});

test("wrestling rotations are deterministic and omit trailing rest", () => {
  assert.deepEqual(contract.buildWrestlingRotation("top-bottom-out",3).map(go=>[go.top,go.bottom,go.out]),
    [[1,2,3],[3,1,2],[2,3,1]]);
  assert.equal(contract.buildWrestlingRotation("match",4).length, 6);
  assert.equal(contract.buildWrestlingRotation("ironman",4).length, 12);
  const phases = contract.compileRotation({format:"top-bottom-out",athleteCount:3,workSeconds:30,restSeconds:10});
  assert.deepEqual(phases.map(item=>item.kind), ["work","rest","work","rest","work"]);
  assert.throws(()=>contract.buildWrestlingRotation("ironman",3),/four or five/);
});

test("match periods, breaks, recovery, and short-time cues calculate exactly", () => {
  const phases = contract.compileMatches({periodSeconds:[180,120,120],periodBreakSeconds:30,
    matchCount:2,recoverySeconds:60,shortTimeSeconds:10});
  assert.equal(phases.filter(item=>item.kind==="work").length,6);
  assert.equal(phases.filter(item=>item.label==="Period break").length,4);
  assert.equal(phases.filter(item=>item.label==="Between matches").length,1);
  assert.equal(phases.reduce((sum,item)=>sum+item.seconds,0),1020);
  assert.ok(phases.filter(item=>item.kind==="work").every(item=>item.shortTimeCueSeconds===10));
});

test("parent block capacity and competing parent interval timers fail closed", () => {
  const drill = contract.createInnerDrill(base());
  assert.equal(contract.validateInnerDrillBlock({parentMinutes:2,parentTimer:null,drills:[drill]}).ok,true);
  assert.deepEqual(contract.validateInnerDrillBlock({parentMinutes:1,parentTimer:null,drills:[drill]}).blockers,
    ["parent-block-capacity-exceeded:110:60","parent-block-reservation-exceeded:2:1"]);
  assert.ok(contract.validateInnerDrillBlock({parentMinutes:2,parentTimer:{pack:"rounds"},drills:[drill]}).blockers
    .includes("parent-timer-conflicts-with-inner-schedule"));
});

test("AUTO, HYBRID, and MANUAL share one contract while MANUAL is authorization-independent", () => {
  const manual = contract.createInnerDrill(base());
  const hybrid = contract.createInnerDrill(base({practiceMode:"hybrid",origin:"server-suggestion",
    recommendationProvenance:diagnostic}));
  const auto = contract.createInnerDrill(base({practiceMode:"auto",origin:"server-suggestion",
    recommendationProvenance:diagnostic}));
  assert.deepEqual([manual,hybrid,auto].map(item=>item.contractVersion),
    Array(3).fill(contract.INNER_DRILL_CONTRACT_VERSION));
  assert.equal(manual.recommendationProvenance,null);
  assert.equal(manual.coachEditable,true);
  assert.throws(()=>contract.createInnerDrill(base({practiceMode:"auto"})),/server suggestion/);
});

test("protected recommendation, Coach Card, and skill provenance survive timing overrides", () => {
  const original = contract.createInnerDrill(base({practiceMode:"hybrid",origin:"server-suggestion",
    recommendationProvenance:diagnostic}));
  const adjusted = contract.overrideInnerDrillTiming(original,{type:"interval",workSeconds:60,restSeconds:20,rounds:2});
  assert.deepEqual(adjusted.coachCard,original.coachCard);
  assert.deepEqual(adjusted.skillProvenance,original.skillProvenance);
  assert.deepEqual(adjusted.recommendationProvenance,original.recommendationProvenance);
  assert.equal(adjusted.originalProposal.scheduledSeconds,original.scheduledSeconds);
});

test("legacy Clipboard shape is preserved with namespaced extended data", () => {
  const drill = contract.createInnerDrill(base());
  assert.deepEqual(Object.keys(contract.toClipboardDrillBlock(drill)).sort(),
    ["coachingCues","cueLevel","flowCues","goal","id","innerDrill","minutes","name"].sort());
  assert.equal(contract.toClipboardDrillBlock(drill).innerDrill.planningOnly,true);
  assert.equal(contract.toClipboardDrillBlock(drill).minutes,2);
});

test("foundation has no Firestore writes, live timer, XP, or progression side effects", () => {
  for (const forbidden of ["firebase-init","httpsCallable","setDoc(","updateDoc(","addDoc(","TimerEngine",
    "incrementXp","promoteTier","mastery","window.setInterval","openPracticeSession"]) {
    assert.doesNotMatch(source,new RegExp(forbidden.replace("(","\\(")));
  }
  assert.match(source,/planningOnly: true/);
  assert.match(source,/authoritative: false/);
  assert.match(source,/eligibleForAuto: false/);
});
