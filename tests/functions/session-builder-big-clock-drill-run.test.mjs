import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Big Clock carries nested drill blocks into the run playlist", async () => {
  const source = await read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js");

  assert.match(source, /drillBlocks:\s*Array\.isArray\(b\.drillBlocks\)/);
  assert.match(source, /function getActiveDrill/);
  assert.match(source, /renderDrillPanel\(current, elapsed\)/);
});

test("Big Clock renders drill name, short goal, cue density, and cue text", async () => {
  const [source, html] = await Promise.all([
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("public/coaches/execution/big-clock-2.0/index.html")
  ]);

  assert.match(html, /id="drillPanel"/);
  assert.match(html, /id="drillName"/);
  assert.match(html, /id="drillGoal"/);
  assert.match(html, /id="drillCueLevel"/);
  assert.match(html, /id="drillFlow"/);

  assert.match(source, /drill\.name/);
  assert.match(source, /drill\.goal/);
  assert.match(source, /drill\.cueLevel/);
  assert.match(source, /drill\.coachingCues/);
  assert.match(source, /drill\.flowCues/);
});

test("legacy sections without drill blocks still use existing card cues and next section behavior", async () => {
  const source = await read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js");

  assert.match(source, /Array\.isArray\(current\?\.cards\)/);
  assert.match(source, /const hasDrills = Array\.isArray\(current\?\.drillBlocks\)/);
  assert.match(source, /if \(!hasDrills\)/);
});
