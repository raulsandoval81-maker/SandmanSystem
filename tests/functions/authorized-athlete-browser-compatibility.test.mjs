import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const supportedRoots = ["public/coaches", "public/communications/coach", "public/intake-coach"];

async function files(directory) {
  const entries = await readdir(path.join(root, directory), {withFileTypes: true});
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? files(relative) : [relative];
  }));
  return nested.flat();
}

test("supported Coach browser paths contain no unscoped athlete root enumeration", async () => {
  const candidates = (await Promise.all(supportedRoots.map(files))).flat()
    .filter((file) => /\.(?:js|html)$/.test(file));
  const offenders = [];
  for (const file of candidates) {
    const source = await readFile(path.join(root, file), "utf8");
    if (/getDocs\s*\(\s*collection\(db,\s*["']athletes["']\s*\)\s*\)/.test(source)
      || /onSnapshot\s*\(\s*collection\(db,\s*["']athletes["']/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("authorized roster loader is role, status, and location scoped", async () => {
  const source = await readFile(path.join(root, "public/assets/js/authorized-athlete-roster.js"), "utf8");
  assert.match(source, /staff\.status !== "active"/);
  assert.match(source, /\["admin", "management", "coach"\]\.includes/);
  assert.match(source, /where\("locationId", "in", locationIds\)/);
  assert.match(source, /if \(staff\.role === "admin"\)/);
  assert.match(source, /if \(!locations\.length\) return/);
});

test("Arena Flow accepts only canonical location identity and legacy records fail closed", async () => {
  const [schedule, arena] = await Promise.all([
    readFile(path.join(root, "public/coaches/competition-schedule/competition-schedule.js"), "utf8"),
    readFile(path.join(root, "public/coaches/execution/arena-flow/arena-flow.logic.js"), "utf8"),
  ]);
  assert.match(schedule, /record\.locationIds\) && record\.locationIds\[0\]/);
  assert.match(arena, /competitionParams\.get\("locationId"\)/);
  assert.match(arena, /if \(!competitionContext\.locationId\)/);
  assert.doesNotMatch(arena, /locationId:\s*competitionContext\.location\b/);
});
