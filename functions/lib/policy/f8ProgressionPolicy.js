"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.F8_PROGRESSION_POLICY = exports.F8_SOURCE_XP_VALUES = exports.F8_TOTAL_JOURNEY_XP = exports.F8_RANKS = exports.F8_STRIPES_PER_RANK = exports.F8_STRIPE_PERCENTAGES = exports.F8_POLICY_VERSION = void 0;
exports.resolveF8RankMetadata = resolveF8RankMetadata;
exports.resolveF8RankXpCap = resolveF8RankXpCap;
exports.calculateF8StripeThresholds = calculateF8StripeThresholds;
exports.calculateF8StripeCount = calculateF8StripeCount;
exports.hasReachedF8RankXpRequirement = hasReachedF8RankXpRequirement;
exports.resolveF8CombinedStrengthHonorMonthlyCap = resolveF8CombinedStrengthHonorMonthlyCap;
exports.resolveF8CompetitionMonthlyCap = resolveF8CompetitionMonthlyCap;
exports.F8_POLICY_VERSION = "f8-road2champion-v2";
exports.F8_STRIPE_PERCENTAGES = Object.freeze([
    25,
    50,
    75,
    100,
]);
exports.F8_STRIPES_PER_RANK = 4;
exports.F8_RANKS = Object.freeze([
    Object.freeze({
        id: "shadow",
        tier: "T0",
        name: "Shadow",
        xpCap: 800,
        combinedStrengthHonorMonthlyCap: 40,
        competitionMonthlyCap: 0,
    }),
    Object.freeze({
        id: "prospect",
        tier: "T1",
        name: "Prospect",
        xpCap: 1600,
        combinedStrengthHonorMonthlyCap: 40,
        competitionMonthlyCap: 50,
    }),
    Object.freeze({
        id: "competitor",
        tier: "T2",
        name: "Competitor",
        xpCap: 2400,
        combinedStrengthHonorMonthlyCap: 60,
        competitionMonthlyCap: 80,
    }),
    Object.freeze({
        id: "contender",
        tier: "T3",
        name: "Contender",
        xpCap: 2800,
        combinedStrengthHonorMonthlyCap: 90,
        competitionMonthlyCap: 80,
    }),
    Object.freeze({
        id: "champion",
        tier: "T4",
        name: "Champion",
        xpCap: 3200,
        combinedStrengthHonorMonthlyCap: 120,
        competitionMonthlyCap: 80,
    }),
]);
exports.F8_TOTAL_JOURNEY_XP = exports.F8_RANKS.reduce((total, rank) => total + rank.xpCap, 0);
exports.F8_SOURCE_XP_VALUES = Object.freeze({
    combatPractice: Object.freeze([5, 10]),
    conditioning: 5,
    shorterRemoteStrength: 5,
    ironWork: 10,
    honor: 5,
    tournament: Object.freeze({
        participation: 10,
        secondDivision: 5,
        podium: 5,
        maximum: 20,
        styleIqProgression: 0,
    }),
});
exports.F8_PROGRESSION_POLICY = Object.freeze({
    version: exports.F8_POLICY_VERSION,
    progressionBars: 1,
    stripesPerRank: exports.F8_STRIPES_PER_RANK,
    stripePercentages: exports.F8_STRIPE_PERCENTAGES,
    ranks: exports.F8_RANKS,
    totalJourneyXp: exports.F8_TOTAL_JOURNEY_XP,
    sourceXpValues: exports.F8_SOURCE_XP_VALUES,
});
function normalizeRankReference(reference) {
    return String(reference).trim().toLowerCase();
}
function resolveF8RankMetadata(reference) {
    const normalized = normalizeRankReference(reference);
    const rank = exports.F8_RANKS.find((candidate) => candidate.id === normalized ||
        candidate.tier.toLowerCase() === normalized ||
        candidate.name.toLowerCase() === normalized);
    if (!rank) {
        throw new RangeError(`Unknown Foundry 8 rank: ${String(reference)}`);
    }
    return rank;
}
function resolveF8RankXpCap(reference) {
    return resolveF8RankMetadata(reference).xpCap;
}
function calculateF8StripeThresholds(referenceOrCap) {
    const cap = typeof referenceOrCap === "number"
        ? referenceOrCap
        : resolveF8RankXpCap(referenceOrCap);
    if (!Number.isFinite(cap) || cap <= 0) {
        throw new RangeError("Foundry 8 rank XP cap must be a positive number.");
    }
    return Object.freeze(exports.F8_STRIPE_PERCENTAGES.map((percentage) => Math.ceil((cap * percentage) / 100)));
}
function calculateF8StripeCount(reference, activeTierXp) {
    const safeXp = Number.isFinite(activeTierXp)
        ? Math.max(0, activeTierXp)
        : 0;
    return calculateF8StripeThresholds(reference).filter((threshold) => safeXp >= threshold).length;
}
function hasReachedF8RankXpRequirement(reference, activeTierXp) {
    return (Number.isFinite(activeTierXp) &&
        activeTierXp >= resolveF8RankXpCap(reference));
}
function resolveF8CombinedStrengthHonorMonthlyCap(reference) {
    return resolveF8RankMetadata(reference).combinedStrengthHonorMonthlyCap;
}
function resolveF8CompetitionMonthlyCap(reference) {
    return resolveF8RankMetadata(reference).competitionMonthlyCap;
}
