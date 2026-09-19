import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { requireStaffLocation, staffHasLocation } from "../../functions/lib/services/staffAuthorization.js";

test("location helper allows assigned and multi-location Management, Admin, and fails closed", () => {
  const syv = { role: "management", staff: { locationIds: ["santa-ynez-valley"] } };
  const multi = { role: "management", staff: { locationIds: ["santa-ynez-valley", "lompoc"] } };
  assert.equal(requireStaffLocation(syv, "santa-ynez-valley"), "santa-ynez-valley");
  assert.throws(() => requireStaffLocation(syv, "lompoc"), /authorized scope/i);
  assert.equal(staffHasLocation(multi.staff, "lompoc"), true);
  assert.equal(requireStaffLocation({ role: "admin", staff: {} }, "elk-grove"), "elk-grove");
  assert.throws(() => requireStaffLocation(syv, ""), /valid location/i);
});

test("access and onboarding mutations authorize against stored athlete location", () => {
  for (const path of [
    "functions/src/access/issueAccessInvitation.ts",
    "functions/src/access/transitionAthleteAccessMode.ts",
    "functions/src/modules/createAthleteOnboardingToken.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /requireStaffLocation\(.*athlete/s, path);
    assert.doesNotMatch(source, /req\.data\?\.locationId/);
  }
});

test("intake mutations authorize stored intake location and persist canonical athlete location", () => {
  for (const path of [
    "functions/src/modules/approveIntakeCall.ts",
    "functions/src/modules/createAthleteFromIntakeCall.ts",
    "functions/src/approveAndActivate.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /requireStaffLocation\(/, path);
    assert.match(source, /intake.*locationId|locationId.*intake/is, path);
  }
  const create = readFileSync("functions/src/modules/createAthleteFromIntakeCall.ts", "utf8");
  assert.match(create, /const athleteData = \{[\s\S]*?locationId,/);
});

test("competition listing scopes Management without broadening Coach", () => {
  const source = readFileSync("functions/src/competitions/listCompetitionEvents.ts", "utf8");
  assert.match(source, /actor\.role !== "management"/);
  assert.match(source, /staffHasLocation\(actor\.staff, locationId\)/);
});

test("browser queues use every assigned location and no locationIds[0] shortcut", () => {
  for (const path of [
    "public/connect/admissions-requests/admissions-requests.js",
    "public/intake-management/management.intake.js",
    "public/management/inbox/inbox.js",
    "public/management/hub/management.js",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /locationIds\s*\[\s*0\s*\]/, path);
    assert.match(source, /locationId/, path);
  }
});
