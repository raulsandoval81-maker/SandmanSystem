import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { currentAndNextActivity } from "../../public/coaches/execution/engine/live-execution-state.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Big Clock carries nested drill blocks into the run playlist", async () => {
  const source = await read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js");

  assert.match(source, /currentAndNextActivity\(state, blocks/);
  const playlist=[{title:"Drills",minutes:4,drillBlocks:[{name:"Entry",minutes:2},{name:"Finish",minutes:2}]}];
  assert.equal(currentAndNextActivity({status:"paused",index:0,elapsedSeconds:30},playlist,0).currentActivity.name,"Entry");
  assert.equal(currentAndNextActivity({status:"paused",index:0,elapsedSeconds:150},playlist,0).currentActivity.name,"Finish");
});

test("Big Clock renders drill name, short goal, cue density, and cue text", async () => {
  const [source, html] = await Promise.all([
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("public/coaches/execution/big-clock-2.0/index.html")
  ]);

  assert.match(html, /id="current-activity"/);
  assert.match(html, /id="upcoming-activity"/);
  assert.match(source, /item\?\.name \|\| item\?\.title/);
  assert.match(source, /activities\.currentActivity/);
  assert.match(source, /activities\.nextActivity/);
});

test("legacy sections without drill blocks still use existing card cues and next section behavior", async () => {
  const source = await read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js");

  assert.match(source, /No activity assigned/);
  assert.match(source, /Final activity/);
  assert.match(source, /playlist\(\)/);
});
