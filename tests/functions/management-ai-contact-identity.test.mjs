import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../../functions/src/modules/management/managementAiContactIdentity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { normalizeContactEmail, normalizeContactPhone, contactIdentity, assessContactLink } = module.exports;

test("email normalization is strict and lowercases safely", () => {
  assert.equal(normalizeContactEmail("  Family@Example.COM "), "family@example.com");
  assert.equal(normalizeContactEmail("not an email"), null);
  assert.equal(normalizeContactEmail(null), null);
});

test("phone normalization rejects ambiguous inputs", () => {
  assert.equal(normalizeContactPhone("(805) 555-0100"), "+18055550100");
  assert.equal(normalizeContactPhone("1-805-555-0100"), "+18055550100");
  assert.equal(normalizeContactPhone("555-0100"), null);
  assert.equal(normalizeContactPhone("805-CALL-ME"), null);
});

test("shared contact data produces human-review hint, never merge", () => {
  assert.deepEqual(assessContactLink(
    { contactName: "Family A", email: "PARENT@EXAMPLE.COM" },
    { contactName: "Family B", email: "parent@example.com" },
  ), { status: "review", reasons: ["email:parent@example.com"] });
});

test("names alone cannot link records", () => {
  assert.deepEqual(assessContactLink(
    { contactName: "Alex Smith" },
    { contactName: "Alex Smith" },
  ), { status: "no-match", reasons: [] });
});

test("alternative field shapes supported without changing storage", () => {
  assert.deepEqual(contactIdentity({ parentEmail: "Parent@example.com", contactPhone: "8055550100" }), {
    email: "parent@example.com",
    phone: "+18055550100",
    identifiers: ["email:parent@example.com", "phone:+18055550100"],
  });
});
