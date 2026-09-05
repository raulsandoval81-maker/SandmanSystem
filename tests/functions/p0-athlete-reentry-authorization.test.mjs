import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { decideOnboardingBinding } from "../../functions/lib/services/onboardingBindingPolicy.js";
import {
  isAuthorizedStaffRecord,
  MANAGEMENT_STAFF_ROLES,
  OPERATIONAL_STAFF_ROLES,
} from "../../functions/lib/services/staffAuthorization.js";

const valid = (overrides = {}) => ({
  athleteId: "F8_1000", callerUid: "auth-1", existingAuthUid: null,
  step1Locked: false, tokenId: "token-1", tokenExists: true,
  tokenAthleteUid: "F8_1000", tokenUsed: false,
  tokenExpiresAt: 2000, now: 1000, ...overrides,
});

test("valid token binds a missing authUid", () => {
  assert.deepEqual(decideOnboardingBinding(valid()), { action: "bind", repaired: false });
});

test("locked step1 with missing authUid is repairable with a valid token", () => {
  assert.deepEqual(decideOnboardingBinding(valid({ step1Locked: true })), { action: "bind", repaired: true });
});

test("matching locked binding is idempotent without consuming another token", () => {
  assert.deepEqual(decideOnboardingBinding(valid({ step1Locked: true, existingAuthUid: "auth-1", tokenId: "" })),
    { action: "idempotent", repaired: false });
});

test("wrong, expired, consumed, and mismatched tokens fail closed", () => {
  assert.throws(() => decideOnboardingBinding(valid({ tokenExists: false })), /TOKEN_NOT_FOUND/);
  assert.throws(() => decideOnboardingBinding(valid({ tokenExpiresAt: 999 })), /TOKEN_EXPIRED/);
  assert.throws(() => decideOnboardingBinding(valid({ tokenUsed: true })), /TOKEN_USED/);
  assert.throws(() => decideOnboardingBinding(valid({ tokenAthleteUid: "F8_OTHER" })), /TOKEN_ATHLETE_MISMATCH/);
});

test("a different existing authUid cannot be replaced", () => {
  assert.throws(() => decideOnboardingBinding(valid({ existingAuthUid: "auth-other" })), /DIFFERENT_AUTH_UID/);
});

test("onboarding binding patch cannot alter XP, rank, stripe, or progression fields", () => {
  const source = readFileSync("functions/src/onboardingConfirmStep1.ts", "utf8");
  const update = source.slice(source.indexOf("tx.update(athleteRef"), source.indexOf("tx.update(tokenRef"));
  for (const protectedField of ["xp", "lifetimeXp", "xpCap", "stripeCount", "tier",
    "progressionTier", "curriculumTier", "rank", "rankName"]) {
    assert.doesNotMatch(update, new RegExp(`\\b${protectedField}\\b`));
  }
});

test("active operational staff are accepted and non-staff records fail", () => {
  for (const role of OPERATIONAL_STAFF_ROLES) {
    assert.equal(isAuthorizedStaffRecord({ role, status: "active" }, OPERATIONAL_STAFF_ROLES), true);
  }
  assert.equal(isAuthorizedStaffRecord({ role: "athlete", status: "active" }, OPERATIONAL_STAFF_ROLES), false);
  assert.equal(isAuthorizedStaffRecord({ role: "coach", status: "inactive" }, OPERATIONAL_STAFF_ROLES), false);
  assert.equal(isAuthorizedStaffRecord({ role: "coach", status: "active" }, MANAGEMENT_STAFF_ROLES), false);
});

test("XP, PASS, PROMOTE, intake, HTTP, and debug adapters contain P0 guards", () => {
  const increment = readFileSync("functions/src/modules/incrementXp.ts", "utf8");
  const pass = readFileSync("functions/src/modules/passAthleteTest.ts", "utf8");
  const promote = readFileSync("functions/src/modules/promotion/promoteTierAction.ts", "utf8");
  const intake = readFileSync("functions/src/modules/createAthleteFromIntakeCall.ts", "utf8");
  const http = readFileSync("functions/src/modules/xpHttp.ts", "utf8");
  const debug = readFileSync("functions/src/modules/testAthleteXp.ts", "utf8");
  assert.match(increment, /if \(!req\.auth\)/);
  assert.match(increment, /requireActiveStaff\(coachUid/);
  assert.match(pass, /if \(!req\.auth\).*unauthenticated/);
  assert.match(pass, /requireActiveStaff\(req\.auth\.uid/);
  assert.match(promote, /if \(!req\.auth\).*unauthenticated/);
  assert.match(promote, /requireActiveStaff\(req\.auth\.uid/);
  assert.match(intake, /MANAGEMENT_STAFF_ROLES/);
  assert.match(intake, /if \(existing\.exists\)/);
  assert.match(intake, /tx\.create\(athleteRef/);
  assert.doesNotMatch(intake, /merge:\s*true/);
  assert.match(http, /verifyIdToken\(bearer\)/);
  assert.doesNotMatch(http, /x-coach-uid/);
  assert.match(debug, /if \(!process\.env\.FIRESTORE_EMULATOR_HOST\)/);
});

test("testing rules deny generic authenticated mutation and require active Coach/Admin", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const athleteRules = rules.slice(rules.indexOf("match /athletes/{athleteId}"), rules.indexOf("/* --------------------------------------\n       Intake"));
  assert.match(athleteRules, /isActiveCoachOrAdmin\(\)[\s\S]*changedKeys\(\)\.hasOnly\(\[[\s\S]*"testing"/);
  assert.match(athleteRules, /match \/testingLogs\/\{logId\}[\s\S]*allow get, list: if isActiveCoachOrAdmin\(\)/);
  assert.match(athleteRules, /allow create: if isActiveCoachOrAdmin\(\)/);
});
