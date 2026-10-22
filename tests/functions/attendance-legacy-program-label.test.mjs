import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const jsPath = new URL("../../public/coaches/attendance/attendance.js", import.meta.url);

test("legacy youth display uses Road2Champion without rewriting identity or XP route", async () => {
  const source = await readFile(jsPath, "utf8");
  assert.match(source, /function athleteProgram\(a = \{\}\)/);
  assert.match(source, /\["z2h", "zero2hero", "r2c", "road2champion"\]/);
  assert.match(source, /return "Road2Champion"/);
  assert.match(source, /return "Path2Legend"/);
  assert.match(source, /uid\.textContent = id/);
  assert.match(source, /const youth = \/f8\|z2h\|r2c/);
});
