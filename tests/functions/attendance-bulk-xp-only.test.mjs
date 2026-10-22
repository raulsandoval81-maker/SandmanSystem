import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const base = new URL("../../public/coaches/attendance/", import.meta.url);

test("bulk XP selection is isolated from attendance and authorizes no awards", async () => {
  const [html, source] = await Promise.all([
    readFile(new URL("index.html", base), "utf8"),
    readFile(new URL("attendance.js", base), "utf8"),
  ]);
  assert.match(html, /id="bulkXpChoices"[^>]*hidden/);
  assert.match(html, /id="bulkXp10"/);
  assert.match(html, /id="bulkXp5"/);
  assert.match(source, /if \(bulk\) bulk\.hidden = !finalized/);
  assert.match(source, /pendingSession\?\.finalized !== true/);
  assert.match(source, /creditedAthletes\.has\(id\)/);
  assert.match(source, /athleteXpOptions\(athlete\)\.includes\(amount\)/);
  assert.match(source, /selectCardXp\(controls, input, label, amount\)/);
  assert.match(source, /selectCardXp\(controls, amountInput, selectionStatus, amount\)/);
  assert.match(source, /if \(choices\.some\(x => !x\.value\)\)/);
  assert.match(source, /completePracticeDailyGrind/);
  assert.match(source, /closePracticeSession/);
});

test("bulk XP and renamed Journey display preserve historical IDs and XP policy aliases", async () => {
  const source = await readFile(new URL("attendance.js", base), "utf8");
  assert.match(source, /uid\.textContent = id/);
  assert.match(source, /const id = String\(athlete\.id \|\| athlete\.uid \|\| ""\)/);
  assert.match(source, /const youth = \/f8\|z2h\|r2c\|road2champion\|youth\//);
  assert.match(source, /return "Road2Champion"/);
});
