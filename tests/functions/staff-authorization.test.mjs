import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const policy = require("../../functions/lib/services/staffAuthorization.js");

test("canonical staff role and scope normalization", () => {
  assert.equal(policy.normalizeStaffRole("admin"), "admin");
  assert.equal(policy.normalizeStaffRole("system-admin"), "admin");
  assert.equal(policy.normalizeStaffRole("manager"), "management");
  assert.equal(policy.normalizeStaffRole("location_manager"), "management");
  assert.equal(policy.normalizeStaffRole("coach"), "coach");

  const normalized = policy.normalizeStaffRecord({
    role: "location_manager",
    status: " ACTIVE ",
    organizationId: "sandman",
    organizationIds: ["sandman", "yesc"],
    academyId: "academy-1",
    locationId: "lompoc",
    locationIds: ["santa-ynez-valley", "lompoc"],
    locations: ["elk-grove"],
    programId: "combat",
  });
  assert.equal(normalized.role, "management");
  assert.equal(normalized.rawRole, "location_manager");
  assert.equal(normalized.status, "active");
  assert.deepEqual(normalized.scope.organizationIds, ["sandman", "yesc"]);
  assert.deepEqual(normalized.scope.academyIds, ["academy-1"]);
  assert.deepEqual(normalized.scope.locationIds, ["santa-ynez-valley", "lompoc", "elk-grove"]);
  assert.deepEqual(normalized.scope.programIds, ["combat"]);
});

test("authorization remains active-status and role restricted", () => {
  assert.equal(policy.isAuthorizedStaffRecord({ role: "system_admin", status: "active" }, ["admin"]), true);
  assert.equal(policy.isAuthorizedStaffRecord({ role: "manager", status: "active" }, ["admin"]), false);
  assert.equal(policy.isAuthorizedStaffRecord({ role: "coach", status: "active" }, ["admin"]), false);
  assert.equal(policy.isAuthorizedStaffRecord({ role: "manager", status: "active" }, ["management"]), true);
  assert.equal(policy.isAuthorizedStaffRecord({ role: "coach", status: "active" }, ["management"]), false);
  assert.equal(policy.isAuthorizedStaffRecord({ role: "admin", status: "inactive" }, ["admin"]), false);
});

test("location authorization is canonical and fail closed", () => {
  const manager = { role: "management", staff: { locationId: "lompoc" } };
  assert.equal(policy.requireStaffLocation(manager, "lompoc"), "lompoc");
  assert.throws(() => policy.requireStaffLocation(manager, "elk-grove"), /authorized scope/i);
  assert.equal(policy.requireStaffLocation({ role: "admin", staff: {} }, "elk-grove"), "elk-grove");
  assert.throws(() => policy.requireStaffLocation(manager, ""), /valid location/i);
});
