import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../../public/coaches/execution/clipboard-2.0/clipboard-2.0.js", import.meta.url);
test("Wave placements match Clipboard blocks without on-mat talk", async () => {
  const js = await readFile(path, "utf8");
  for (const block of ['"drills", "Review of Prior Week\'s Skills"', '"technique", "Introduction of New Techniques"', '"live", "Live Session"', '"cond", "Conditioning / Skill Activities"']) {
    assert.ok(js.includes(block), block);
  }
  assert.ok(js.includes('if (!/^(drills|technique|live|cond)$/.test(slot)) continue;'));
  assert.ok(js.includes('WAVE_BLOCK_DESTINATIONS.forEach'));
  assert.ok(!js.includes('["onmat","On-Mat Talk"]'));
  assert.ok(js.includes('normalizedWavePlacement'));
  assert.ok(js.includes('progressionVerified:false'));
});
