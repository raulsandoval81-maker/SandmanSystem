import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../../public/assets/js/staff-context.js", import.meta.url), "utf8");
const context = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("browser staff context preserves distinct authorities and aliases", () => {
  const admin = context.normalizeStaffContext({ role: "system_admin", status: "active" });
  const management = context.normalizeStaffContext({ role: "location-manager", status: "active" });
  const coach = context.normalizeStaffContext({ role: "coach", status: "active" });
  assert.equal(context.isActiveAdmin(admin), true);
  assert.equal(context.isActiveManagement(admin), false);
  assert.equal(context.isActiveManagement(management), true);
  assert.equal(context.isActiveCoach(management), false);
  assert.equal(context.isActiveCoach(coach), true);
  assert.equal(context.isActiveAdmin(context.normalizeStaffContext({ role: "admin", status: "inactive" })), false);
});

test("browser scope merges plural and singular compatibility fields", () => {
  const staff = context.normalizeStaffContext({
    organizationIds: ["one"], organizationId: "two",
    academyIds: ["academy"], academyId: "academy",
    locationIds: ["lompoc"], locations: ["elk-grove"], locationId: "santa-ynez-valley",
    programIds: ["combat"], program: "ignored", programId: "fitness",
  });
  assert.deepEqual(staff.scope.organizationIds, ["one", "two"]);
  assert.deepEqual(staff.scope.academyIds, ["academy"]);
  assert.deepEqual(staff.scope.locationIds, ["lompoc", "elk-grove", "santa-ynez-valley"]);
  assert.deepEqual(staff.scope.programIds, ["combat", "fitness"]);
});
