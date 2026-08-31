"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XP_DOMAIN_FIREWALL = exports.XP_DOMAIN_POLICY_VERSION = exports.XP_DOMAINS = void 0;
exports.resolveAuthoritativeActiveRankXp = resolveAuthoritativeActiveRankXp;
exports.resolveLifetimeXpAccumulation = resolveLifetimeXpAccumulation;
exports.isXpDomainConversionPermitted = isXpDomainConversionPermitted;
exports.awardLaneFeedsActiveRankXp = awardLaneFeedsActiveRankXp;
exports.XP_DOMAINS = Object.freeze({
    ACTIVE_RANK: "ACTIVE_RANK",
    LIFETIME: "LIFETIME",
    CHALLENGE: "CHALLENGE",
    STRENGTH: "STRENGTH",
    HONOR: "HONOR",
});
exports.XP_DOMAIN_POLICY_VERSION = "xp-domain-firewall-v1";
exports.XP_DOMAIN_FIREWALL = Object.freeze({
    version: exports.XP_DOMAIN_POLICY_VERSION,
    authoritativeActiveRankField: "xp",
    permittedFutureConversions: Object.freeze([
        Object.freeze({ from: exports.XP_DOMAINS.CHALLENGE, to: exports.XP_DOMAINS.LIFETIME }),
    ]),
    forbiddenConversions: Object.freeze([
        Object.freeze({ from: exports.XP_DOMAINS.CHALLENGE, to: exports.XP_DOMAINS.ACTIVE_RANK }),
        Object.freeze({ from: exports.XP_DOMAINS.CHALLENGE, to: exports.XP_DOMAINS.STRENGTH }),
        Object.freeze({ from: exports.XP_DOMAINS.CHALLENGE, to: exports.XP_DOMAINS.HONOR }),
        Object.freeze({ from: exports.XP_DOMAINS.LIFETIME, to: exports.XP_DOMAINS.ACTIVE_RANK }),
    ]),
});
function resolveAuthoritativeActiveRankXp(athlete) {
    return Number(athlete?.xp ?? 0);
}
function resolveLifetimeXpAccumulation(athlete, activeRankXpBefore, activeRankXpAfter) {
    const before = Number(athlete?.lifetimeXp ?? 0);
    if (!Number.isFinite(before) || before < 0) {
        throw new Error("INVALID_LIFETIME_XP");
    }
    const delta = Math.max(0, activeRankXpAfter - activeRankXpBefore);
    return Object.freeze({ before, after: before + delta, delta });
}
function isXpDomainConversionPermitted(from, to) {
    return exports.XP_DOMAIN_FIREWALL.permittedFutureConversions.some((conversion) => conversion.from === from && conversion.to === to);
}
function awardLaneFeedsActiveRankXp(base, lane) {
    if (lane === "JOURNEY")
        return true;
    if (lane === "CHALLENGE")
        return false;
    return base === "F8" && (lane === "STRENGTH" || lane === "HONOR");
}
