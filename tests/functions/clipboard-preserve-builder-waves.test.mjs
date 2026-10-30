import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("public/coaches/execution/clipboard-2.0/clipboard-2.0.js", "utf8");

test("Clipboard recognizes accepted builder prescriptions before selecting system Waves", () => {
  assert.match(source, /const upstreamPrescriptions = Array\.isArray\(builderSession\.groupPrescriptions\)/);
  assert.match(source, /entry\?\.status === "ready" && entry\?\.contentState === "accepted"/);
  assert.match(source, /builderSession\.clipboardWaveSelections\[id\] = accepted\.waveKey/);
  assert.match(source, /!coachChangedWaves && selectedByBuilder/);
});

test("Clipboard preserves accepted card metadata until explicit Coach Wave changes", () => {
  assert.match(source, /accepted && accepted\.waveKey === selected \? accepted : prescriptions\[index\]/);
  assert.match(source, /const effective = builderSession\.groupPrescriptions/);
  assert.match(source, /acceptedLessonContent = Object\.fromEntries\(effective\.map/);
  assert.match(source, /waveCheck\.addEventListener\("change",\(\)=>\{coachChangedWaves=true;/);
});

test("Clipboard retains explicit unavailability rather than certifying unmapped groups", () => {
  assert.match(source, /status:cards\.length \? "ready" : "unavailable"/);
  assert.match(source, /progressionVerified:false, progressionStatus:"unverified"/);
});
