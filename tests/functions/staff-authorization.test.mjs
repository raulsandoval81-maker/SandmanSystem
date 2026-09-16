import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const staff = require("../../functions/lib/services/staffAuthorization.js");

test("canonical roles preserve temporary read-compatible aliases", () => {
  assert.equal(staff.normalizeStaffRole("system-admin"), "admin");
  assert.equal(staff.normalizeStaffRole("manager"), "management");
  assert.equal(staff.normalizeStaffRole("location_manager"), "management");
  assert.equal(staff.normalizeStaffRole("coach"), "coach");
  for (const role of ["admin", "system_admin", "management", "manager", "location_manager"]) {
    assert.equal(staff.isAuthorizedStaffRecord({ role, status: " ACTIVE " }, staff.MANAGEMENT_STAFF_ROLES), true);
  }
  assert.equal(staff.isAuthorizedStaffRecord({ role: "coach", status: "active" }, staff.MANAGEMENT_STAFF_ROLES), false);
  assert.equal(staff.isAuthorizedStaffRecord({ role: "management", status: "inactive" }, staff.MANAGEMENT_STAFF_ROLES), false);
});

test("canonical and singular legacy locations normalize without duplicates", () => {
  const record = staff.normalizeStaffRecord({
    role: "location_manager", status: " ACTIVE ",
    locationIds: ["santa-ynez-valley", "lompoc"], locations: ["elk-grove"], locationId: "lompoc",
  });
  assert.equal(record.role, "management");
  assert.equal(record.status, "active");
  assert.deepEqual(record.scope.locationIds, ["santa-ynez-valley", "lompoc", "elk-grove"]);
  assert.deepEqual(staff.staffLocationIds({ locationId: "lompoc" }), ["lompoc"]);
});

test("location authorization allows Admin and assigned Management only", () => {
  const manager = { role: "manager", staff: { locationId: "lompoc" } };
  assert.equal(staff.requireStaffLocation(manager, "lompoc"), "lompoc");
  assert.throws(() => staff.requireStaffLocation(manager, "elk-grove"), /authorized scope/i);
  assert.throws(() => staff.requireStaffLocation(manager, ""), /valid location/i);
  assert.equal(staff.requireStaffLocation({ role: "system_admin", staff: {} }, "elk-grove"), "elk-grove");
  assert.throws(() => staff.requireStaffLocation({ role: "coach", staff: {} }, "lompoc"), /authorized scope/i);
});
