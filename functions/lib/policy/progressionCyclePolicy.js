"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promotionRanks = promotionRanks;
exports.resolvePromotionTransition = resolvePromotionTransition;
exports.progressionCycleSnapshot = progressionCycleSnapshot;
exports.nextProgressionCycle = nextProgressionCycle;
exports.isPromotionCooldownComplete = isPromotionCooldownComplete;
const https_1 = require("firebase-functions/v2/https");
const f8ProgressionPolicy_1 = require("./f8ProgressionPolicy");
const F4_RANKS = Object.freeze([
    Object.freeze({ tier: "T0", rankName: "Apprentice", xpCap: 1000 }),
    Object.freeze({ tier: "T1", rankName: "Warrior", xpCap: 1600 }),
    Object.freeze({ tier: "T2", rankName: "Champion", xpCap: 2200 }),
    Object.freeze({ tier: "T3", rankName: "Veteran", xpCap: 2800 }),
    Object.freeze({ tier: "T4", rankName: "Legend", xpCap: 3200 }),
]);
function promotionRanks(base) {
    if (base === "F4")
        return F4_RANKS;
    return ["T0", "T1", "T2", "T3", "T4"].map((tier) => {
        const rank = (0, f8ProgressionPolicy_1.resolveF8RankMetadata)(tier);
        return Object.freeze({ tier: rank.tier, rankName: rank.name, xpCap: rank.xpCap });
    });
}
function resolvePromotionTransition(base, tier) {
    const ranks = promotionRanks(base);
    const index = ranks.findIndex((rank) => rank.tier === tier);
    if (index < 0)
        throw new https_1.HttpsError("failed-precondition", `Unknown ${base} tier: ${tier}`);
    if (index === ranks.length - 1) {
        throw new https_1.HttpsError("failed-precondition", `${base}_FINAL_RANK_CANNOT_PROMOTE`);
    }
    return Object.freeze({ current: ranks[index], next: ranks[index + 1] });
}
function progressionCycleSnapshot(athlete, tier) {
    const stored = athlete?.progressionCycle;
    const sequence = Number.isInteger(stored?.sequence) && stored.sequence >= 0
        ? stored.sequence : 0;
    const id = String(stored?.id ?? "").trim() || `legacy:${tier}`;
    return Object.freeze({ id, sequence, tier: String(stored?.tier ?? tier) });
}
function nextProgressionCycle(athlete, nextTier, uniqueId) {
    const prior = progressionCycleSnapshot(athlete, String(athlete?.tier ?? "T0"));
    return Object.freeze({
        id: `${nextTier}:v${prior.sequence + 1}:${uniqueId}`,
        sequence: prior.sequence + 1,
        tier: nextTier,
        previousId: prior.id,
    });
}
function isPromotionCooldownComplete(testing, nowMs) {
    if (String(testing?.state ?? "").toUpperCase() !== "COOLDOWN")
        return false;
    if (String(testing?.lastTestResult ?? "").toUpperCase() !== "PASS")
        return false;
    const value = testing?.cooldownUntil;
    const untilMs = typeof value?.toMillis === "function"
        ? value.toMillis() : new Date(value ?? "").getTime();
    return Number.isFinite(untilMs) && untilMs <= nowMs;
}
