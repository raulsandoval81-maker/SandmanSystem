import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const policy = require("../../functions/lib/admin/staffGovernancePolicy.js");

test("canonical governance updates accept Admin, Management, Coach and multi-location scope", () => {
  assert.deepEqual(policy.validateStaffGovernanceUpdate({
    staffUid: "manager-1", role: "management", status: "active",
    locationIds: ["lompoc", "santa-ynez-valley"],
  }), {
    staffUid: "manager-1", role: "management", status: "active",
    locationIds: ["lompoc", "santa-ynez-valley"],
  });
  assert.equal(policy.validateStaffGovernanceUpdate({
    staffUid: "admin-1", role: "admin", status: "active", locationIds: [],
  }).role, "admin");
  assert.equal(policy.validateStaffGovernanceUpdate({
    staffUid: "coach-1", role: "coach", status: "inactive", locationIds: ["elk-grove"],
  }).status, "inactive");
});

test("governance rejects aliases, unknown status, malformed, duplicate, and free-text scope", () => {
  const base = { staffUid: "staff-1", role: "coach", status: "active", locationIds: ["lompoc"] };
  for (const role of ["manager", "location_manager", "system_admin", "owner", ""]) {
    assert.throws(() => policy.validateStaffGovernanceUpdate({ ...base, role }), /canonical staff role/i);
  }
  assert.throws(() => policy.validateStaffGovernanceUpdate({ ...base, status: "enabled" }), /canonical staff status/i);
  assert.throws(() => policy.validateStaffGovernanceUpdate({ ...base, locationIds: "lompoc" }), /must be an array/i);
  assert.throws(() => policy.validateStaffGovernanceUpdate({ ...base, locationIds: ["lompoc", "lompoc"] }), /duplicates/i);
  assert.throws(() => policy.validateStaffGovernanceUpdate({ ...base, locationIds: ["Santa Ynez"] }), /unknown location/i);
  assert.throws(() => policy.validateStaffGovernanceUpdate({ ...base, locationIds: [] }), /explicit location scope/i);
});

test("last-active-Admin transition detection covers demotion and deactivation", () => {
  const current = { role: "system_admin", status: "active" };
  assert.equal(policy.removesActiveAdmin(current, { role: "admin", status: "inactive" }), true);
  assert.equal(policy.removesActiveAdmin(current, { role: "coach", status: "active" }), true);
  assert.equal(policy.removesActiveAdmin(current, { role: "admin", status: "active" }), false);
  assert.equal(policy.removesActiveAdmin({ role: "admin", status: "inactive" }, { role: "coach", status: "active" }), false);
});

test("callable is Admin-only, transactional, and writes only canonical authority fields", () => {
  const source = readFileSync("functions/src/admin/updateStaffGovernance.ts", "utf8");
  assert.match(source, /requireActiveStaff\(request\.auth\.uid, \["admin"\]/);
  assert.match(source, /runTransaction/);
  assert.match(source, /activeAdminCount <= 1/);
  assert.match(source, /tx\.update\(targetRef/);
  assert.doesNotMatch(source, /MANAGEMENT_STAFF_ROLES|COACH_STAFF_ROLES/);
});

test("Staff & Roles uses the callable and offers no legacy write roles", () => {
  const service = readFileSync("public/admin/services/staff.service.js", "utf8");
  const page = readFileSync("public/admin/people/staff.html", "utf8");
  assert.match(service, /httpsCallable\(functions, "updateStaffGovernance"\)/);
  assert.doesNotMatch(service, /setDoc|updateDoc/);
  assert.doesNotMatch(page, /value="location_manager"|value="system_admin"|value="system-team"/);
});
