import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Read-only architecture contract. These tests deliberately do not invoke XP endpoints.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const admin = read("public/admin/services/admin.service.js");
const adminPage = read("public/admin/system/xp-adjustments.page.js");
const managementPage = read("public/management/xp-adjustments/xp-adjustments.js");
const management = read("functions/src/management/managementXpTools.ts");
const coach = read("functions/src/modules/xpHttp.ts");
const authority = read("functions/src/services/authoritativeXpService.ts");

test("admin and management are separate active adjustment entry points", () => {
  assert.match(adminPage, /applyXpAdjustment/);
  assert.match(managementPage, /createManagementXpAdjustment/);
  assert.match(management, /export const createManagementXpAdjustment/);
});

test("document current admin direct-write behavior before any migration", () => {
  assert.match(admin, /await updateDoc\(athleteRef, athletePatch\)/);
  assert.match(admin, /await addDoc\(collection\(db, "xpLogs"\)/);
  assert.match(admin, /Math\.max\(0, beforeXp \+ xpAmount\)/);
  assert.doesNotMatch(admin, /runTransaction|writeBatch|httpsCallable/);
});

test("management uses a server transaction, staff and location checks, and idempotency receipt", () => {
  assert.match(management, /requireActiveStaff/);
  assert.match(management, /requireLocationAccess/);
  assert.match(management, /db\.runTransaction/);
  assert.match(management, /xpAwardReceipts/);
  assert.match(management, /resolveDisciplineXpAuthority/);
  assert.match(management, /resolveLifetimeXpEffects/);
});

test("coach entry point dispatches to authoritative XP service", () => {
  assert.match(coach, /requireCoachAthleteAccessById/);
  assert.match(coach, /dispatchAuthoritativeXp\(coachUid, payload\)/);
  assert.match(authority, /export async function awardXpAuthoritatively/);
  assert.match(authority, /db\.runTransaction/);
});
