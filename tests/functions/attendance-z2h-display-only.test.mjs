import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy Z2H and R2C display Road2Champion while bulk XP preserves athlete identity", async () => {
  const source = await readFile(new URL("../../public/coaches/attendance/attendance.js", import.meta.url), "utf8");
  assert.match(source, /\["z2h", "zero2hero", "r2c", "road2champion"\]/);
  assert.match(source, /return "Road2Champion"/);
  assert.match(source, /uid\.textContent = id/);
  assert.match(source, /const youth = \/f8\|z2h\|r2c/);
  assert.match(source, /function applyXpToAll\(amount\)/);
  assert.match(source, /creditedAthletes\.has\(id\)/);
  assert.match(source, /athleteXpOptions\(athlete\)\.includes\(amount\)/);
});
