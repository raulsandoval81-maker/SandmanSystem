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
  assert.match(attendance, /planning=1/);
  assert.match(server, /sessionMemory\.planningContext/);
  assert.match(server, /evidenceEffect: "none"/);
});
