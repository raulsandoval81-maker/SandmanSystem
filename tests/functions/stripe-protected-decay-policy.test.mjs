import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const filename = new URL("../../functions/src/modules/decay/stripeProtectedDecayPolicy.ts", import.meta.url);
const source = readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
runInNewContext(compiled, { exports });
const { resolveStripeProtectedDecay: decay } = exports;

test("decay stops at the last earned stripe floor", () => {
  assert.equal(decay({ currentXp: 280, earnedStripeFloorXp: 200, requestedDeduction: 150 }).afterXp, 200);
  assert.equal(decay({ currentXp: 280, earnedStripeFloorXp: 200, requestedDeduction: 150 }).appliedDeduction, 80);
});

test("decay does not affect progress above the floor unnecessarily", () => {
  assert.equal(decay({ currentXp: 280, earnedStripeFloorXp: 200, requestedDeduction: 30 }).afterXp, 250);
});

test("invalid or stale floor fails closed", () => {
  assert.throws(() => decay({ currentXp: 150, earnedStripeFloorXp: 200, requestedDeduction: 10 }));
  assert.throws(() => decay({ currentXp: 200, earnedStripeFloorXp: 100, requestedDeduction: -1 }));
  assert.throws(() => decay({ currentXp: 200.5, earnedStripeFloorXp: 100, requestedDeduction: 1 }));
});
