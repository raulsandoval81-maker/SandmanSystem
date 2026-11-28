#!/usr/bin/env node
/**
 * Sprint 4 read-only curriculum inventory.
 * No credentials, Firestore, external services, or writes to production data.
 * Reports source presence, never manufactures missing stages.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inventory = [];
const failures = [];

function inspect(lane, segment, relativePath) {
  const full = path.join(repoRoot, relativePath);
  if (!fs.existsSync(full)) {
    inventory.push({ lane, segment, status: "missing", path: relativePath });
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(full, "utf8"));
    if (!Array.isArray(data.sessions) || !data.sessions.length) {
      throw new Error("Nonempty sessions array required");
    }
    const numbers = data.sessions.map(s => Number(s.n ?? s.sessionN));
    if (numbers.some(n => !Number.isInteger(n) || n < 1) ||
        new Set(numbers).size !== numbers.length) {
      throw new Error("Session numbers must be unique positive integers");
    }
    inventory.push({
      lane, segment, status: "present", path: relativePath,
      title: String(data.segmentTitle || ""),
      sessions: data.sessions.length,
      first: Math.min(...numbers), last: Math.max(...numbers),
    });
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
    inventory.push({ lane, segment, status: "invalid", path: relativePath });
  }
}

for (let stage = 1; stage <= 6; stage++) {
  inspect("character-honor", stage, `public/vault/honor/segment${stage}/sessions.json`);
  for (const track of ["f4", "f8"]) {
    inspect(`conditioning-${track}`, stage,
      `public/vault/conditioning/${track}/segment${stage}/sessions.json`);
  }
}

const byLane = ["character-honor", "conditioning-f4", "conditioning-f8"].map(lane => {
  const rows = inventory.filter(row => row.lane === lane);
  return {
    lane,
    presentStages: rows.filter(row => row.status === "present").map(row => row.segment),
    missingStages: rows.filter(row => row.status === "missing").map(row => row.segment),
    invalidStages: rows.filter(row => row.status === "invalid").map(row => row.segment),
    sessionCount: rows.reduce((sum, row) => sum + (row.sessions || 0), 0),
  };
});
const report = { scope: "sprint4-read-only-curriculum-inventory", schemaVersion: 1,
  entries: inventory, summary: byLane, errors: failures };
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (failures.length) process.exitCode = 1;
