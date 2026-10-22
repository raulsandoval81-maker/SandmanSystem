import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clipboard = new URL("../../public/coaches/execution/clipboard-2.0/clipboard-2.0.js", import.meta.url);
test("HYBRID Clipboard renders one exact lesson card with group membership and overrides", async () => {
  const js = await readFile(clipboard, "utf8");
  assert.ok(js.includes("function sharedWaveCardKey(card)"));
  assert.ok(js.includes("function collectSharedWaveCards(groups, models, selections)"));
  assert.ok(js.includes('String(card.id || card.cardId || "")'));
  assert.ok(js.includes('String(card.href || "")'));
  assert.ok(js.includes('String(card.title || "")'));
  assert.ok(js.includes('shared.get(key).participants.push'));
  assert.ok(js.includes('collectSharedWaveCards(groups, models, builderSession.clipboardWaveSelections)'));
  assert.ok(js.includes("item.participants.forEach(p => setPlacement(p, sharedSelect.value))"));
  assert.ok(js.includes("Individual group adjustments"));
  assert.ok(js.includes('normalizedWavePlacement(builderSession.clipboardWavePlacements'));
  assert.ok(js.includes('progressionVerified:false'));
  assert.ok(!js.includes('heading.textContent = "Coach adjustments · " + cards.length'));
});
