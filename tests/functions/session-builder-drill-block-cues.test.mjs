import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Clipboard adds drill blocks inside existing practice sections without changing entry modes", async () => {
  const [clipboard, policy] = await Promise.all([
    read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js"),
    read("public/coaches/execution/session-builder/session-entry-policy.js")
  ]);

  assert.match(clipboard, /DRILL_BLOCK_SLOTS[\s\S]*"warmup"[\s\S]*"drills"[\s\S]*"technique"[\s\S]*"live"[\s\S]*"cond"/);
  assert.match(clipboard, /CUE_LEVELS[\s\S]*"minimal"[\s\S]*"optimal"[\s\S]*"maximum"/);
  assert.match(clipboard, /"Position"[\s\S]*"Go"[\s\S]*"Next position"[\s\S]*"5 sec"/);
  assert.match(policy, /SESSION_ENTRY_MODES[\s\S]*"checked-in"[\s\S]*"hybrid"[\s\S]*"manual"[\s\S]*"quick"/);
});

test("drill blocks persist through draft, run payload, plan save, and practice closeout", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");

  assert.match(clipboard, /drillBlocks:\s*captureDrillBlocks\(block\)/);
  assert.match(clipboard, /renderSavedDrillBlocks\(block, saved\.drillBlocks \|\| \[\]\)/);
  assert.match(clipboard, /drillBlocks:\s*captureDrillBlocks\(b\)/);
  assert.match(clipboard, /plannedBlocks:[\s\S]*drillBlocks: block\.drillBlocks \|\| \[\]/);
});

test("drill block model keeps cue density separate from neutral flow cues", async () => {
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");

  assert.match(clipboard, /cueLevel:\s*normalizeCueLevel/);
  assert.match(clipboard, /coachingCues:/);
  assert.match(clipboard, /flowCues:/);
  assert.match(clipboard, /class="drill-cue-level"/);
  assert.match(clipboard, /class="drill-coaching-cues"/);
  assert.match(clipboard, /class="drill-flow-cues"/);
});


test("Coach Companion preserves nested drill blocks from the live session", async () => {
  const companion = await read("public/coaches/execution/coach-companion/coach-companion.js");

  assert.match(companion, /sourceBlock[\s\S]*session\?\.blocks\?\.find/);
  assert.match(companion, /drillBlocks:\s*Array\.isArray\(sourceBlock\?\.drillBlocks\)/);
});
