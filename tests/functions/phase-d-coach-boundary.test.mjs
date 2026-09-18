import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  COACH_STAFF_ROLES,
  MANAGEMENT_STAFF_ROLES,
  isAuthorizedStaffRecord,
  requireCoachAthleteAccess,
} from "../../functions/lib/services/staffAuthorization.js";

const active = (role, locationIds = []) => ({ role, status: "active", locationIds });
const actor = (uid, role, locationIds = []) => ({ uid, role, staff: active(role, locationIds) });

test("Coach roles are explicit and do not include Management", () => {
  assert.deepEqual([...COACH_STAFF_ROLES], ["admin", "coach"]);
  assert.equal(isAuthorizedStaffRecord(active("coach"), COACH_STAFF_ROLES), true);
  assert.equal(isAuthorizedStaffRecord(active("coach"), MANAGEMENT_STAFF_ROLES), false);
  assert.equal(isAuthorizedStaffRecord(active("management"), COACH_STAFF_ROLES), false);
  assert.equal(isAuthorizedStaffRecord({ role: "coach", status: "inactive" }, COACH_STAFF_ROLES), false);
});

test("Coach athlete access accepts assignment or authorized location and fails closed", () => {
  assert.doesNotThrow(() => requireCoachAthleteAccess(actor("coach-a", "coach"), { coachUid: "coach-a" }));
  assert.doesNotThrow(() => requireCoachAthleteAccess(actor("coach-a", "coach"), { coachIds: ["coach-a"] }));
  assert.doesNotThrow(() => requireCoachAthleteAccess(
    actor("coach-a", "coach", ["santa-ynez-valley"]),
    { locationId: "santa-ynez-valley" }
  ));
  assert.throws(() => requireCoachAthleteAccess(
    actor("coach-a", "coach", ["santa-ynez-valley"]),
    { locationId: "lompoc" }
  ), /training scope/i);
  assert.throws(() => requireCoachAthleteAccess(actor("coach-a", "coach"), {}), /training scope/i);
  assert.throws(() => requireCoachAthleteAccess(actor("manager-a", "management", ["lompoc"]), { locationId: "lompoc" }), /training scope/i);
  assert.doesNotThrow(() => requireCoachAthleteAccess(actor("admin-a", "admin"), {}));
});

test("Coach-only mutation adapters use the shared role and athlete ownership boundary", () => {
  for (const path of [
    "functions/src/modules/addDisciplineCoachCall.ts",
    "functions/src/modules/incrementXp.ts",
    "functions/src/modules/passAthleteTest.ts",
    "functions/src/modules/promotion/promoteTierAction.ts",
    "functions/src/modules/xpHttp.ts",
    "functions/src/modules/logArenaHttp.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /COACH_STAFF_ROLES/, path);
    assert.match(source, /requireCoachAthleteAccessById/, path);
    assert.doesNotMatch(source, /OPERATIONAL_STAFF_ROLES/, path);
  }
  for (const path of [
    "functions/src/modules/scheduleTesting.ts",
    "functions/src/modules/startTesting.ts",
    "functions/src/modules/retestAthlete.ts",
    "functions/src/modules/parent/saveCoachNote.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /if \(!req\.auth\)/, path);
    assert.match(source, /COACH_STAFF_ROLES/, path);
    assert.match(source, /requireCoachAthleteAccess\(actor, athlete\)/, path);
  }
  for (const path of [
    "functions/src/modules/freezeAthlete.ts",
    "functions/src/modules/finalizeTestingSession.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /if \(!req\.auth\)/, path);
    assert.match(source, /COACH_STAFF_ROLES/, path);
    assert.match(source, /requireCoachAthleteAccessById/, path);
  }
});

test("testing history is authenticated and filtered through athlete ownership", () => {
  const source = readFileSync("functions/src/modules/getTestingHistory.ts", "utf8");
  assert.match(source, /if \(!req\.auth\)/);
  assert.match(source, /COACH_STAFF_ROLES/);
  assert.match(source, /requireCoachAthleteAccess\(actor, athleteSnap\.data\(\) \|\| \{\}\)/);
});

test("obsolete unauthenticated coachAction mutation surface fails closed", () => {
  const source = readFileSync("functions/src/modules/coachAction.ts", "utf8");
  assert.match(source, /status\(410\)/);
  assert.doesNotMatch(source, /athleteRef\.update|APPROVE_PROMOTION|TRIGGER_CEREMONY/);
});

test("approveAndActivate add_sport is Coach-owned and checks the stored athlete twice", () => {
  const source = readFileSync("functions/src/approveAndActivate.ts", "utf8");
  assert.match(source, /mode === "add_sport" \? COACH_STAFF_ROLES : MANAGEMENT_STAFF_ROLES/);
  assert.equal((source.match(/requireCoachAthleteAccess\(activationActor, (?:existingAthlete|athleteData)\)/g) || []).length, 2);
  assert.match(source, /mode !== "add_sport"[\s\S]*requireStaffLocation/);
});

test("practice mutations are Coach/Admin only while Management attendance reads remain separate", () => {
  const practice = readFileSync("functions/src/practice/practiceSessions.ts", "utf8");
  const managementRead = readFileSync("functions/src/practice/listManagementAttendance.ts", "utf8");
  assert.match(practice, /const PRACTICE_STAFF_ROLES = COACH_STAFF_ROLES/);
  assert.doesNotMatch(practice, /MANAGEMENT_STAFF_ROLES/);
  assert.match(managementRead, /MANAGEMENT_STAFF_ROLES/);
});

test("Management and Admin domains remain distinct", () => {
  const intake = readFileSync("functions/src/modules/approveIntakeCall.ts", "utf8");
  const oversight = readFileSync("functions/src/admin/getAdminOversightSummary.ts", "utf8");
  assert.match(intake, /MANAGEMENT_STAFF_ROLES/);
  assert.doesNotMatch(intake, /COACH_STAFF_ROLES/);
  assert.match(oversight, /requireActiveStaff\(request\.auth\.uid, \["admin"\]/);
});
