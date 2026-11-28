import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function runInventory() {
  const run = spawnSync(process.execPath, ["scripts/sprint4/inventory-curriculum.mjs"], {
    cwd: root, encoding: "utf8", timeout: 30000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

test("Sprint 4 inventory covers six explicit stages across the three current lanes", () => {
  const report = runInventory();
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.entries.length, 18);
  assert.equal(report.errors.length, 0);
  for (const lane of ["character-honor", "conditioning-f4", "conditioning-f8"]) {
    const entries = report.entries.filter(row => row.lane === lane);
    assert.deepEqual(entries.map(row => row.segment), [1, 2, 3, 4, 5, 6]);
    for (const row of entries.filter(row => row.status === "present")) {
      assert.ok(row.sessions > 0);
      assert.ok(row.last >= row.first);
      assert.match(row.path, /^public\/vault\//);
    }
  }
});

test("Sprint 4 inventory reports existing curriculum without inventing stages 4–6", () => {
  const report = runInventory();
  const honor = report.summary.find(row => row.lane === "character-honor");
  const f4 = report.summary.find(row => row.lane === "conditioning-f4");
  const f8 = report.summary.find(row => row.lane === "conditioning-f8");
  assert.deepEqual(honor.presentStages, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(f4.presentStages, [1, 2, 3]);
  assert.deepEqual(f8.presentStages, [1, 2, 3]);
  assert.deepEqual(f4.missingStages, [4, 5, 6]);
  assert.deepEqual(f8.missingStages, [4, 5, 6]);
});
