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

test("admin adjustment and log commit atomically", () => {
  assert.match(admin, /await runTransaction\(db, async \(tx\) =>/);
  assert.match(admin, /tx\.update\(athleteRef, athletePatch\)/);
  assert.match(admin, /tx\.set\(logRef, \{/);
  assert.match(admin, /Math\.max\(0, beforeXp \+ xpAmount\)/);
  assert.doesNotMatch(admin, /await updateDoc|await addDoc/);
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

test("admin rejects fractional or unsafe XP and records effective delta", () => {
  assert.ok(admin.includes("Number.isSafeInteger(xpAmount)"));
  assert.ok(admin.includes("Number.isSafeInteger(beforeXp)"));
  assert.ok(admin.includes("amount: appliedDelta"));
  assert.ok(admin.includes("requestedAmount: xpAmount"));
  assert.ok(admin.includes("amount: result.appliedDelta"));
});

test("management does not silently treat a deduction as earned XP", () => {
  assert.ok(management.includes("amount <= 0"));
  assert.ok(management.includes("resolveManagementAdjustmentSemantic"));
  assert.ok(management.includes("resolveLifetimeXpEffects"));
});

test("management correction requires explicit safe lifetime classification on both sides", () => {
  const ui = read("public/management/xp-adjustments/xp-adjustments.js");
  const html = read("public/management/xp-adjustments/index.html");
  assert.ok(html.includes('id="adjustmentSemantic"'));
  assert.ok(ui.includes("adjustmentSemanticInput"));
  assert.match(ui, /semantic \? \{ semantic \}/);
  assert.match(ui, /pendingAdjustmentIds.get\(requestKey\)/);
  assert.ok(management.includes("MANAGEMENT_CORRECTION_SEMANTIC_REQUIRED"));
  assert.ok(management.includes("UNSUPPORTED_MANAGEMENT_SEMANTIC"));
  assert.ok(management.includes('"RESTORE_ALREADY_COUNTED_XP"'));
});

test("Admin commits the balance and effective signed delta together, or commits neither", async () => {
  const { runInNewContext } = await import("node:vm");
  const scope = {};
  const committed = [];
  let rejectLog = false;
  const doc = (_parent, ...parts) => parts.join("/") || "new-log";
  const source = admin.replace(/^import[\s\S]*?from\s+["'][^"']+["'];/gm, "")
    .replace("export async function applyXpAdjustment", "async function applyXpAdjustment");
  runInNewContext(source + "\nscope.adjust = applyXpAdjustment;", {
    scope, db: {}, doc, collection: () => "xpLogs", serverTimestamp: () => "now",
    console: { log() {} },
    async runTransaction(_db, callback) {
      const pending = [];
      const result = await callback({
        get: async () => ({ exists: () => true, data: () => ({ xp: 20 }) }),
        update: (ref, value) => pending.push({ ref, value }),
        set: (ref, value) => {
          if (rejectLog) throw new Error("audit write rejected");
          pending.push({ ref, value });
        },
      });
      committed.push(...pending);
      return result;
    },
  });
  const input = { uid: "fictional-athlete", amount: -30, kind: "manual" };
  const result = await scope.adjust(input);
  assert.equal(result.afterXp, 0);
  assert.equal(committed[0].value.xp, 0);
  assert.equal(committed[1].value.amount, -20);
  assert.equal(committed[1].value.requestedAmount, -30);
  rejectLog = true;
  await assert.rejects(scope.adjust(input), /audit write rejected/);
  assert.equal(committed.length, 2);
});
