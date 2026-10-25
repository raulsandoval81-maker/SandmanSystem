import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const policy = await import(pathToFileURL(path.join(repo, "public/coaches/execution/session-builder/hybrid-planning-policy.js")));

test("HYBRID supports all seven nonempty planning-source combinations", () => {
  for (let mask = 1; mask < 8; mask += 1) {
    const value = Object.fromEntries(policy.HYBRID_PLANNING_SOURCES.map((key, index) => [key, Boolean(mask & (1 << index))]));
    assert.equal(policy.enabledPlanningSources(value).length, Number(value.tierWaves) + Number(value.systemSuggestions) + Number(value.coachInput));
  }
});

test("an explicit partial source selection never enables omitted levers", () => {
  assert.deepEqual(policy.normalizePlanningSources({ tierWaves: true }), {
    tierWaves: true,
    systemSuggestions: false,
    coachInput: false
  });
});

test("MANUAL and AUTO cannot inherit HYBRID planning sources", () => {
  assert.deepEqual(policy.enabledPlanningSources(policy.DEFAULT_HYBRID_PLANNING_SOURCES, "manual"), []);
  assert.deepEqual(policy.enabledPlanningSources(policy.DEFAULT_HYBRID_PLANNING_SOURCES, "auto"), []);
});

test("group selections remain isolated and accepted waves never certify progression", () => {
  const sources = { tierWaves: true, systemSuggestions: true, coachInput: true };
  const a = policy.composeGroupPlanning({ group: { id: "group-1", carryForwardNote: "Revisit stance" }, sources, wave: { waveKey: "base", cards: [{ id: "a" }] } });
  const b = policy.composeGroupPlanning({ group: { id: "group-2" }, sources, wave: { waveKey: "finish", cards: [{ id: "b" }] } });
  assert.equal(a.tierWave.waveKey, "base");
  assert.equal(b.tierWave.waveKey, "finish");
  assert.equal(a.tierWave.progressionVerified, false);
  assert.equal(a.systemSuggestion.progressionVerified, false);
  assert.equal(a.coachInput.establishesMastery, false);
  assert.deepEqual(policy.acceptedCardsForGroup(a).map(card => card.id), ["a"]);
});

test("missing wave mappings produce no accepted prescription", () => {
  const planning = policy.composeGroupPlanning({ group: { id: "group-1" }, sources: { tierWaves: true }, wave: null });
  assert.equal(planning.tierWave, null);
  assert.deepEqual(policy.acceptedCardsForGroup(planning), []);
});

test("rerender recovery preserves nested Coach disposition and current instructions", () => {
  assert.deepEqual(policy.editableGroupPlanning({
    tierWave: { waveKey: "top_control" },
    coachInput: {
      originalCarryForwardNote: "Original",
      currentNote: "Revised",
      disposition: "edited"
    }
  }, { carryForwardNote: "Fallback" }), {
    selectedWave: "top_control",
    originalCarryForwardNote: "Original",
    currentNote: "Revised",
    disposition: "edited"
  });
});

test("accepted group cards enter executable content with group roster isolation", () => {
  const cards = policy.executableCardsForBlock({
    cards: [{ id: "practice-wide", title: "Warmup" }],
    groupActivities: [
      { status: "ready", groupId: "group-1", athleteIds: ["a1"], cards: [{ id: "card-1", familyId: "family-1" }] },
      { status: "unavailable", groupId: "group-2", athleteIds: ["a2"], cards: [{ id: "card-2" }] }
    ]
  });
  assert.deepEqual(cards.map(card => [card.id, card.groupId, card.athleteIds]), [
    ["practice-wide", "", []],
    ["card-1", "group-1", ["a1"]]
  ]);
});

test("Group D survives HYBRID planning and execution with isolated athletes", () => {
  const groupActivities = Array.from({ length: 4 }, (_, index) => ({
    status: "ready",
    groupId: `group-${index + 1}`,
    athleteIds: [`athlete-${index + 1}`],
    cards: [{ id: `card-${index + 1}` }]
  }));
  const cards = policy.executableCardsForBlock({ groupActivities });
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.at(-1), {
    id: "card-4",
    groupId: "group-4",
    athleteIds: ["athlete-4"]
  });
});

test("workflow carries planning provenance without changing AUTO safeguards", () => {
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const clipboard = fs.readFileSync(path.join(repo, "public/coaches/execution/clipboard-2.0/clipboard-2.0.js"), "utf8");
  const attendance = fs.readFileSync(path.join(repo, "public/coaches/attendance/session.js"), "utf8");
  const server = fs.readFileSync(path.join(repo, "functions/src/practice/practiceSessions.ts"), "utf8");
  assert.match(builder, /planningSources/);
  assert.match(builder, /progressionVerified = false/);
  assert.match(builder, /autoPendingVerification: true/);
  assert.match(clipboard, /groupPlanning/);
  assert.match(clipboard, /acceptedLessonContent/);
  assert.match(clipboard, /executableCardsForBlock\(block\)/);
  assert.match(fs.readFileSync(path.join(repo, "public/coaches/execution/big-clock-2.0/big-clock-2.0.js"), "utf8"), /block\?\.groupActivities/);
  // Checked-in HYBRID now goes directly to Clipboard; the old planning=1 route is intentionally bypassed.
  assert.match(attendance, /Both MANUAL and HYBRID now enter the same checked-in Clipboard/);
  assert.match(attendance, /\/coaches\/execution\/clipboard-2\.0\/\?session=/);
  assert.doesNotMatch(attendance, /planning=1/);
  assert.match(attendance, /activePractice\?\.executionMode/);
  assert.match(server, /sessionMemory\.planningContext/);
  assert.match(server, /input\.groups\) \? input\.groups : \[\]\)\.slice\(0, 4\)/);
  assert.match(server, /evidenceEffect: "none"/);
  assert.match(server, /card\.athleteIds\.includes\(athleteId\)/);
  assert.match(server, /workedCards: record\.workedCards/);
  assert.match(server, /workedSkillRefs: record\.workedSkillRefs/);
});

test("Session Builder preserves Coach edits across rerenders and labels each mode truthfully", () => {
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const css = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.css"), "utf8");
  assert.match(builder, /input\.closest\("\.hybrid-group-card"\)/);
  assert.match(builder, /autoBlocked = selectedMode === "auto"/);
  assert.match(builder, /AUTO Awaiting Certified Authorization/);
  assert.match(builder, /reviewingPlan && selectedMode === "hybrid"[\s\S]*Accept Plan and Continue to Clipboard/);
  assert.match(builder, /reviewingPlan[\s\S]*Continue to Clipboard/);
  assert.match(css, /\.entry-mode-row\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
});

test("HYBRID instructional sources start opt-in while MANUAL remains unrestricted", () => {
  assert.deepEqual(policy.normalizePlanningSources({}, "hybrid"), {
    tierWaves: false, systemSuggestions: false, coachInput: false
  });
  assert.deepEqual(policy.enabledPlanningSources({}, "hybrid"), []);
  assert.deepEqual(policy.enabledPlanningSources({ tierWaves: true }, "hybrid"), ["tierWaves"]);
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  assert.match(builder, /const noHybridSources = false/);
});
