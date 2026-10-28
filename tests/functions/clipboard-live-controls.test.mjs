import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../public/coaches/execution/clipboard-2.0/index.html", import.meta.url), "utf8");
const control = fs.readFileSync(new URL("../../public/coaches/execution/clipboard-2.0/clipboard-live-controls.mjs", import.meta.url), "utf8");

test("live controls sit immediately below the Clipboard time status and before plan contents", () => {
  const time = html.indexOf('id="totalTime"');
  const strip = html.indexOf('id="clipboardLiveControls"');
  const plan = html.indexOf('id="planBlocks"');
  assert.ok(time >= 0 && time < strip && strip < plan);
  assert.match(html, /id="clipboardLivePrimary"/);
  assert.match(html, /id="clipboardNextDrill"/);
  assert.match(html, /id="clipboardNextBlock"/);
});

test("Clipboard shares authoritative command channel without starting another timer", () => {
  assert.match(control, /requireCoach\(\)/);
  assert.match(control, /getPracticeSession/);
  assert.match(control, /savePracticeSessionMemory/);
  assert.match(control, /operation: "execution-command"/);
  assert.match(control, /expectedVersion: version/);
  assert.match(control, /control\.appliedVersion/);
  assert.match(control, /primary\.dataset\.command = paused \? "resume" : running \? "pause" : "start"/);
  assert.match(control, /nextDrill\(memory, state\)/);
  assert.match(control, /send\("switch-drill"\)/);
  assert.match(control, /send\("advance"\)/);
  assert.doesNotMatch(control, /setInterval\([^)]*1000[^)]*\)/);
  assert.doesNotMatch(control, /awardXp|finalizeXp|closePracticeSession/);
});
