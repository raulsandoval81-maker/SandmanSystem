const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertArchivable,
  assertCommandCenterTransition,
  isCommandCenterOwnerStaff,
  validateCommandCenterProject,
} = require("../lib/admin/commandCenterPolicy.js");

const base = (overrides = {}) => ({
  title: "Command Center V1",
  summary: "Owner infrastructure",
  module: "projects_roadmaps",
  status: "planned",
  priority: "high",
  repository: "raulsandoval81-maker/SandmanSystem",
  branch: "codex/admin-os-command-center-v1",
  prUrl: "",
  environment: "local",
  testEvidence: [],
  blockers: [],
  nextAction: "Run acceptance",
  ...overrides,
});

test("Command Center owner authority requires exact active Admin permission", () => {
  assert.equal(isCommandCenterOwnerStaff({ role: "admin", status: "active", commandCenterOwner: true }), true);
  for (const staff of [
    { role: "admin", status: "active" },
    { role: "admin", status: "inactive", commandCenterOwner: true },
    { role: "management", status: "active", commandCenterOwner: true },
    { role: "coach", status: "active", commandCenterOwner: true },
    { role: "owner", status: "active", commandCenterOwner: true },
  ]) assert.equal(isCommandCenterOwnerStaff(staff), false);
});

test("project validation rejects schema pollution and oversized confidential fields", () => {
  assert.equal(validateCommandCenterProject(base()).status, "planned");
  assert.throws(() => validateCommandCenterProject(base({ title: "x".repeat(161) })), /too long/i);
  assert.throws(() => validateCommandCenterProject(base({ blockers: Array(21).fill("blocked") })), /too many/i);
  assert.throws(() => validateCommandCenterProject(base({ prUrl: "http://example.com/pr/1" })), /HTTPS/i);
  assert.throws(() => validateCommandCenterProject(base({ status: "complete" })), /invalid/i);
});

test("engineering completion states require progressively stronger evidence", () => {
  const testEvidence = [{ type: "test", result: "pass", label: "Native suite", url: "https://example.com/test" }];
  assert.throws(() => validateCommandCenterProject(base({ status: "tested" })), /test evidence/i);
  assert.equal(validateCommandCenterProject(base({ status: "tested", testEvidence })).status, "tested");
  assert.throws(() => validateCommandCenterProject(base({ status: "merged", testEvidence })), /pull request/i);
  const merged = { status: "merged", testEvidence, prUrl: "https://github.com/example/repo/pull/1" };
  assert.equal(validateCommandCenterProject(base(merged)).status, "merged");
  assert.throws(() => validateCommandCenterProject(base({ ...merged, status: "deployed", environment: "staging" })), /deployment evidence/i);
  const deployedEvidence = [...testEvidence, { type: "deployment", result: "pass", label: "Staging", url: "https://example.com/deploy" }];
  assert.equal(validateCommandCenterProject(base({ ...merged, status: "deployed", environment: "staging", testEvidence: deployedEvidence })).status, "deployed");
  assert.throws(() => validateCommandCenterProject(base({ ...merged, status: "verified", environment: "staging", testEvidence: deployedEvidence })), /verification evidence/i);
  const verifiedEvidence = [...deployedEvidence, { type: "verification", result: "pass", label: "Acceptance", url: "https://example.com/verify" }];
  assert.equal(validateCommandCenterProject(base({ ...merged, status: "verified", environment: "staging", testEvidence: verifiedEvidence })).status, "verified");
});

test("status transitions distinguish delivery stages and archive only verified work", () => {
  assert.doesNotThrow(() => assertCommandCenterTransition(null, "planned"));
  assert.doesNotThrow(() => assertCommandCenterTransition("built", "tested"));
  assert.doesNotThrow(() => assertCommandCenterTransition("deployed", "verified"));
  assert.throws(() => assertCommandCenterTransition("planned", "verified"), /Invalid status transition/i);
  assert.throws(() => assertCommandCenterTransition("tested", "deployed"), /Invalid status transition/i);
  assert.doesNotThrow(() => assertArchivable("verified"));
  assert.throws(() => assertArchivable("deployed"), /Only verified/i);
});
