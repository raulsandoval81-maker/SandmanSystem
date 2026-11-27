"use strict";

// Development-only inventory and activation gate. Does not serve or modify Vault records.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { vault, paths } = require("./inventory.cjs");
const approvals = require("./athlete-note-approvals.v1.json");

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function collectNotes() {
  const rows = [];
  for (const source of paths) {
    const raw = readFileSync(join(vault, source), "utf8");
    if (!raw.trim()) continue;
    const document = JSON.parse(raw);
    const visit = (node, at) => {
      if (Array.isArray(node)) {
        node.forEach((entry, index) => visit(entry, at.concat(String(index))));
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          const location = at.concat(key);
          if (key === "coachNote") {
            rows.push({
              source,
              pointer: "/" + location.map(s => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/"),
              valueHash: fingerprint(value),
              valueType: Array.isArray(value) ? "array" : typeof value,
              // Include original value only in process memory; never emit it by default.
              value
            });
          }
          visit(value, location);
        }
      }
    };
    visit(document, []);
  }
  return rows;
}

function verifyApprovals(rows, manifest = approvals) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error("Invalid approval manifest schema");
  }
  const possible = new Map(rows.map(r => [r.source + "#" + r.pointer, r]));
  const accepted = new Map();
  const allowed = new Set(["athlete-instruction", "coach-only", "athlete-feedback"]);
  for (const decision of manifest.decisions) {
    const key = decision.source + "#" + decision.pointer;
    const row = possible.get(key);
    if (!row || accepted.has(key) || !allowed.has(decision.audience) ||
        row.valueHash !== decision.valueHash ||
        typeof decision.reviewedBy !== "string" || !decision.reviewedBy.trim() ||
        typeof decision.reason !== "string" || !decision.reason.trim()) {
      throw new Error("Invalid, duplicate, stale, or unsupported approval: " + key);
    }
    accepted.set(key, decision);
  }
  return {
    total: rows.length,
    approved: accepted.size,
    unresolved: rows.filter(r => !accepted.has(r.source + "#" + r.pointer))
      .map(({ source, pointer, valueHash }) => ({ source, pointer, valueHash })),
    // This gate never grants access. It only blocks migration until all entries are reviewed.
    readyForMigrationReview: rows.length > 0 && accepted.size === rows.length
  };
}

if (require.main === module) {
  try {
    const rows = collectNotes();
    const result = verifyApprovals(rows);
    if (process.argv.includes("--inventory")) {
      process.stdout.write("source\tpointer\tvalue_sha256\ttype\tdecision\n");
      const accepted = new Map(approvals.decisions.map(d => [d.source + "#" + d.pointer, d.audience]));
      for (const row of rows) {
        process.stdout.write([row.source, row.pointer, row.valueHash, row.valueType,
          accepted.get(row.source + "#" + row.pointer) || "UNRESOLVED"].join("\t") + "\n");
      }
    } else {
      process.stdout.write(JSON.stringify({
        sources: paths.length, noteOccurrences: result.total, approved: result.approved,
        unresolved: result.unresolved.length, readyForMigrationReview: result.readyForMigrationReview
      }) + "\n");
    }
    // STOP_NO_RETRY: this intentionally fails until every value is reviewed.
    if (!result.readyForMigrationReview) process.exitCode = 2;
  } catch (error) {
    process.stderr.write("Vault note audit stopped: " + error.message + "\n");
    process.exitCode = 1;
  }
}

module.exports = { collectNotes, verifyApprovals, fingerprint };
