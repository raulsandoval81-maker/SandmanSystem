"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { SOURCE, validPath, prohibitedPath, scan, validatePlan } = require("./common.cjs");

const oid = "1".repeat(40);
const sha256 = "2".repeat(64);
const source = [{ path: "functions/example.ts", mode: "100644", type: "blob", oid }];
const keep = { path: source[0].path, action: "keep", oid, sha256, reason: "application-code" };
const plan = (...entries) => ({ version: 1, source: SOURCE, entries });

test("accepts a complete object-bound classification", () => {
  assert.equal(validatePlan(plan(keep), source).length, 1);
});

test("rejects missing, duplicate, untracked and mismatched classifications", () => {
  for (const entries of [
    [], [keep, keep], [{ ...keep, oid: "3".repeat(40) }],
    [keep, { path: "unknown.txt", action: "exclude", reason: "unknown" }],
  ]) assert.throws(() => validatePlan(plan(...entries), source));
});

test("rejects traversal, Git metadata and portable path collisions", () => {
  for (const path of ["../secret", ".git/config", "/tmp/file", "x\\y", "x//y", "x/../y"]) {
    assert.equal(validPath(path), false);
  }
  const added = { path: "FUNCTIONS/EXAMPLE.TS", action: "add", sha256, reason: "demo-fixture" };
  assert.throws(() => validatePlan(plan(keep, added), source));
});

test("rejects production paths, credential markers and unsupported Git modes", () => {
  for (const path of [".github/workflows/release.yml", ".firebaserc", "firebase.staging.json", "scripts/stripe/run.js", "customer.csv"]) {
    assert.equal(prohibitedPath(path), true);
  }
  assert.equal(prohibitedPath("firebase.commercial-emulator.json"), false);
  assert.throws(() => scan({ toString: () => "sandmancombat.com" }));
  assert.throws(() => scan({ toString: () => "sk_" + "live_" + "Z".repeat(22) }));
  assert.throws(() => validatePlan(plan(keep), [{ ...source[0], mode: "120000" }]));
});
