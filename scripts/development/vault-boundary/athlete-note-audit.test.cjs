"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { collectNotes, verifyApprovals, fingerprint } = require("./athlete-note-audit.cjs");

test("Vault note inventory is read-only, location-specific, and includes real records", () => {
  const records = collectNotes();
  assert.ok(records.length > 0, "Expected existing coachNote records");
  assert.ok(records.every(r => r.source && r.pointer.endsWith("/coachNote") && /^[a-f0-9]{64}$/.test(r.valueHash)));
  assert.equal(new Set(records.map(r => r.source + "#" + r.pointer)).size, records.length);
});

test("Unreviewed notes cannot pass compatibility approval", () => {
  const records = collectNotes();
  const summary = verifyApprovals(records);
  assert.equal(summary.readyForMigrationReview, false);
  assert.equal(summary.approved, 0);
  assert.equal(summary.unresolved.length, records.length);
});

test("Stale hash, nonexistent location, and unsupported audience are rejected", () => {
  const first = collectNotes()[0];
  const base = { source: first.source, pointer: first.pointer, valueHash: first.valueHash,
    reviewedBy: "example-reviewer", reason: "example-reviewed-content" };
  for (const changed of [
    { ...base, valueHash: fingerprint("different"), audience: "athlete-instruction" },
    { ...base, pointer: "/not-present/coachNote", audience: "coach-only" },
    { ...base, audience: "public" }
  ]) {
    assert.throws(() => verifyApprovals([first], { schemaVersion: 1, decisions: [changed] }));
  }
});

test("A reviewed subset cannot be mistaken for complete approval", () => {
  const records = collectNotes();
  assert.ok(records.length > 1);
  const first = records[0];
  const decision = { source: first.source, pointer: first.pointer, valueHash: first.valueHash,
    audience: "coach-only", reviewedBy: "example-reviewer", reason: "test-only" };
  const summary = verifyApprovals(records, { schemaVersion: 1, decisions: [decision] });
  assert.equal(summary.readyForMigrationReview, false);
  assert.equal(summary.unresolved.length, records.length - 1);
});
