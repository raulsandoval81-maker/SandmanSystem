import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isPromotionCooldownComplete,
  nextProgressionCycle,
  progressionCycleSnapshot,
  promotionRanks,
  resolvePromotionTransition,
} from "../../functions/lib/policy/progressionCyclePolicy.js";
import {
  awardReceiptKey,
  buildAwardPlan,
  normalizeXpRequest,
} from "../../functions/lib/services/authoritativeXpService.js";

const serviceSource = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
const passSource = readFileSync("functions/src/modules/passAthleteTest.ts", "utf8");
const promoteSource = readFileSync("functions/src/modules/promotion/promoteTierAction.ts", "utf8");
const indexSource = readFileSync("functions/src/index.ts", "utf8");

test("reaching the XP cap does not auto-promote", () => {
  const athlete = { uid: "F8_1", trackBase: "F8", tier: "T0", xp: 795 };
  const request = normalizeXpRequest({ uid: athlete.uid, kind: "ATTENDANCE", amount: 10 });
  const out = buildAwardPlan({ athlete, athleteId: athlete.uid, request, monthly: {} });
  assert.equal(out.tier, "T0");
  assert.equal(out.afterXp, 800);
  assert.doesNotMatch(serviceSource, /resolvePromotionTransition|promoteTierAction/);
});

test("PASS is exported separately and does not invoke promotion", () => {
  assert.match(indexSource, /export \{ passAthleteTest \}/);
  assert.doesNotMatch(passSource, /resolvePromotionTransition|toTier|promotionHistory/);
});

test("PASS preserves active tier XP and stripes", () => {
  const updateBlock = passSource.slice(passSource.indexOf("tx.update(athleteRef"),
    passSource.indexOf("tx.create(passReceiptRef"));
  assert.doesNotMatch(updateBlock, /\btier:/);
  assert.doesNotMatch(updateBlock, /\bxp:/);
  assert.doesNotMatch(updateBlock, /stripeCount/);
});

test("PASS requires TESTING, score 85, and active-rank cap", () => {
  assert.match(passSource, /Athlete must be TESTING before PASS/);
  assert.match(passSource, /score < PASSING_SCORE/);
  assert.match(passSource, /ACTIVE_RANK_XP_REQUIREMENT_NOT_REACHED/);
});

test("PASS starts a five-day cooldown", () => {
  assert.match(passSource, /const COOLDOWN_DAYS = 5/);
  assert.match(passSource, /"testing\.state": "COOLDOWN"/);
});

test("PASS receipt makes retry idempotent without repeating signals", () => {
  assert.match(passSource, /testingActionReceipts/);
  assert.match(passSource, /return \{ \.\.\.\(receiptSnap\.data\(\)\?\.result \|\| \{\}\), ok: true, idempotent: true \}/);
  assert.match(passSource, /if \(!result\.idempotent\)/);
});

test("cooldown must be completed before promotion", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  assert.equal(isPromotionCooldownComplete({ state: "COOLDOWN", lastTestResult: "PASS", cooldownUntil: future }, Date.now()), false);
  assert.equal(isPromotionCooldownComplete({ state: "COOLDOWN", lastTestResult: "PASS", cooldownUntil: past }, Date.now()), true);
  assert.equal(isPromotionCooldownComplete({ state: "TESTING", lastTestResult: "PASS", cooldownUntil: past }, Date.now()), false);
});

test("successful F8 promotion advances exactly one approved rank", () => {
  assert.deepEqual(resolvePromotionTransition("F8", "T0"), {
    current: { tier: "T0", rankName: "Shadow", xpCap: 800 },
    next: { tier: "T1", rankName: "Prospect", xpCap: 1600 },
  });
  assert.equal(resolvePromotionTransition("F8", "T3").next.tier, "T4");
});

test("successful F4 promotion advances exactly one compatible rank", () => {
  assert.deepEqual(promotionRanks("F4").map((rank) => rank.xpCap), [1000, 1600, 2200, 2800, 3200]);
  assert.equal(resolvePromotionTransition("F4", "T1").next.tier, "T2");
});

test("final F8 Hero and F4 Legend cannot promote", () => {
  assert.throws(() => resolvePromotionTransition("F8", "T4"), /F8_FINAL_RANK_CANNOT_PROMOTE/);
  assert.throws(() => resolvePromotionTransition("F4", "T4"), /F4_FINAL_RANK_CANNOT_PROMOTE/);
});

test("legacy athletes get a deterministic non-destructive cycle fallback", () => {
  assert.deepEqual(progressionCycleSnapshot({}, "T2"), { id: "legacy:T2", sequence: 0, tier: "T2" });
});

test("promotion creates a versioned next cycle linked to the prior cycle", () => {
  assert.deepEqual(nextProgressionCycle({ tier: "T0", progressionCycle: {
    id: "legacy:T0", sequence: 0, tier: "T0",
  } }, "T1", "log-1"), {
    id: "T1:v1:log-1", sequence: 1, tier: "T1", previousId: "legacy:T0",
  });
});

test("promotion atomically resets active XP and stripes", () => {
  assert.match(promoteSource, /db\.runTransaction/);
  assert.match(promoteSource, /\bxp: 0,/);
  assert.match(promoteSource, /stripeCount: 0,/);
  assert.match(promoteSource, /tier: transition\.next\.tier/);
});

test("promotion preserves historical XP and testing audit data", () => {
  assert.match(promoteSource, /promotionHistory/);
  assert.match(promoteSource, /beforeXp: promotionResult\.beforeXp/);
  assert.match(promoteSource, /beforeStripeCount: promotionResult\.beforeStripeCount/);
  assert.match(promoteSource, /createTestingEvent/);
});

test("promotion does not reset monthly caps, source buckets, or curriculum", () => {
  assert.doesNotMatch(promoteSource, /monthly\.|xpDaily|xpArena|xpStrength|xpHonor/);
  assert.doesNotMatch(promoteSource, /curriculum/i);
});

test("next award after promotion starts from zero and ignores old buckets", () => {
  const athlete = {
    uid: "F8_2", trackBase: "F8", tier: "T1", xp: 0, xpCap: 1600,
    xpDaily: 800, xpArena: 250, xpStrength: 100, xpHonor: 100,
  };
  const request = normalizeXpRequest({ uid: athlete.uid, kind: "ATTENDANCE", amount: 10 });
  const out = buildAwardPlan({ athlete, athleteId: athlete.uid, request,
    monthly: { attendance: 10, strength: 10, honor: 10 } });
  assert.equal(out.beforeXp, 0);
  assert.equal(out.afterXp, 10);
  assert.equal(out.stripeCount, 0);
});

test("monthly values remain safeguards and never become active XP", () => {
  const athlete = { uid: "F4_2", trackBase: "F4", tier: "T1", xp: 0, xpDaily: 9999 };
  const request = normalizeXpRequest({ uid: athlete.uid, kind: "ATTENDANCE", amount: 10 });
  const out = buildAwardPlan({ athlete, athleteId: athlete.uid, request,
    monthly: { attendance: 100, arena: 70 } });
  assert.equal(out.beforeXp, 0);
  assert.equal(out.afterXp, 10);
  assert.equal(out.monthlyAfter, 110);
});

test("old-cycle event replay remains suppressed by global logical receipt identity", () => {
  const identity = "attendance:old-session";
  assert.equal(awardReceiptKey("F8_3", identity), awardReceiptKey("F8_3", identity));
  assert.doesNotMatch(serviceSource.slice(serviceSource.indexOf("awardReceiptKey"),
    serviceSource.indexOf("export function arenaLayerKey")), /progressionCycle/);
});

test("a genuinely new event in the new cycle remains awardable and idempotent", () => {
  const oldKey = awardReceiptKey("F8_3", "attendance:old-session");
  const newKey = awardReceiptKey("F8_3", "attendance:new-session");
  assert.notEqual(oldKey, newKey);
  assert.equal(newKey, awardReceiptKey("F8_3", "attendance:new-session"));
});

test("award logs and receipts record the active progression cycle", () => {
  assert.match(serviceSource, /progressionCycleId/);
  assert.match(serviceSource, /tx\.create\(receiptRef/);
});

test("only the narrowed promotion action is exported live", () => {
  assert.match(indexSource, /modules\/promotion\/promoteTierAction/);
  assert.doesNotMatch(indexSource, /from "\.\/modules\/promoteTier"/);
});

test("athlete profile renders intentional active XP zero before historical buckets", () => {
  const profileSource = readFileSync("public/athletes/profile/profile.js", "utf8");
  const activeIndex = profileSource.indexOf("a.xp ??");
  const bucketIndex = profileSource.indexOf("xpDaily + xpArena + xpFightIQ");
  assert.ok(activeIndex >= 0 && bucketIndex > activeIndex);
});
