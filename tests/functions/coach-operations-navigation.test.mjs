import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("shared Coach navigation exposes operational homes instead of raw tools", async () => {
  const shell = await read("public/coaches/_ui/coach-shell.js");
  const expected = ["Coach Home", "Daily Operations", "Practice Operations", "Competition Operations", "Athlete Operations", "Team Operations", "Emergency Operations", "System Operations"];
  expected.forEach((label) => assert.match(shell, new RegExp(`\\[\\\"${label}\\\"`)));
  ["Skill Check", "Daily Grind", "Curriculum", "Assessment", "Testing", "Command Center", "More Tools"].forEach((label) => {
    assert.doesNotMatch(shell, new RegExp(`\\[\\\"${label}\\\"`));
  });
});

test("legacy tool routes resolve to their owning operation for active navigation", async () => {
  const shell = await read("public/coaches/_ui/coach-shell.js");
  assert.match(shell, /\["practice", \["\/coaches\/practice\/", "\/coaches\/execution\/", "\/coaches\/attendance\/", "\/coaches\/daily-xp\/"/);
  assert.match(shell, /\["athletes", \["\/coaches\/athletes\/", "\/coaches\/roster\/", "\/coaches\/assessments\/", "\/coaches\/skill-check\/"/);
  assert.match(shell, /\["system", \["\/coaches\/system\/", "\/coaches\/schedule\/", "\/coaches\/profiles\/"/);
});

test("Home routes to every Coach operation", async () => {
  const home = await read("public/coaches/hub/index.html");
  ["/coaches/today/", "/coaches/practice/", "/coaches/competition/", "/coaches/athletes/", "/coaches/team/", "/coaches/safety/", "/coaches/system/"].forEach((href) => {
    assert.match(home, new RegExp(`href=\\\"${href}\\\"`));
  });
});

test("Today owns existing Command Center without changing its route", async () => {
  const [today, commandCenter] = await Promise.all([
    read("public/coaches/today/index.html"),
    read("public/coaches/command-center/index.html"),
  ]);
  assert.match(today, /href="\/coaches\/command-center\/"/);
  assert.match(commandCenter, /data-coach-area="today"/);
});

test("external products remain optional launches and FuelAI has no dead link", async () => {
  const pages = await Promise.all([
    read("public/coaches/today/index.html"),
    read("public/coaches/practice/index.html"),
    read("public/coaches/competition/index.html"),
    read("public/coaches/athletes/index.html"),
    read("public/coaches/team/index.html"),
  ]);
  const combined = pages.join("\n");
  assert.match(combined, /https:\/\/cornerman-ai\.vercel\.app\//);
  assert.doesNotMatch(combined, /href="[^"]*fuel/i);
  assert.match(combined, /FuelAI/);
});
