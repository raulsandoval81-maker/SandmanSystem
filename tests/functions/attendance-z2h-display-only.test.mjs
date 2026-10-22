import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy Z2H and R2C codes display Road2Champion but do not mutate identity or XP logic", async () => {
  const source = await readFile(new URL("../../public/coaches/attendance/attendance.js", import.meta.url), "utf8");
  assert.match(source, /\["z2h", "zero2hero", "r2c", "road2champion"\]/);
  assert.match(source, /return "Road2Champion"/);
  assert.match(source, /uid\.textContent = id/);
  assert.match(source, /const youth = \/f8\|z2h\|r2c/);
  assert.doesNotMatch(source, /function applyXpToAll/);
});
