"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XP_DOMAIN_FIREWALL = exports.XP_DOMAIN_POLICY_VERSION = exports.LIFETIME_XP_SCHEMA_VERSION = exports.LIFETIME_XP_RECEIPT_VERSION = exports.XP_DOMAINS = void 0;
exports.resolveAuthoritativeActiveRankXp = resolveAuthoritativeActiveRankXp;
exports.resolveLifetimeXpAccumulation = resolveLifetimeXpAccumulation;
exports.resolveLifetimeDomain = resolveLifetimeDomain;
exports.resolveLifetimeXpState = resolveLifetimeXpState;
exports.resolveManagementAdjustmentSemantic = resolveManagementAdjustmentSemantic;
exports.resolveLifetimeXpEffects = resolveLifetimeXpEffects;
exports.assertLifetimeInvariant = assertLifetimeInvariant;
exports.lifetimeXpPatch = lifetimeXpPatch;
exports.isXpDomainConversionPermitted = isXpDomainConversionPermitted;
exports.awardLaneFeedsActiveRankXp = awardLaneFeedsActiveRankXp;
exports.XP_DOMAINS = Object.freeze({
    ACTIVE_RANK: "ACTIVE_RANK",
    LIFETIME: "LIFETIME",
    CHALLENGE: "CHALLENGE",
    STRENGTH: "STRENGTH",
    HONOR: "HONOR",
});
exports.LIFETIME_XP_RECEIPT_VERSION = "lifetime-components-v1";
exports.LIFETIME_XP_SCHEMA_VERSION = "domain-components-v1";
const COMPONENT_FIELDS = Object.freeze({
    COMBAT: "lifetimeCombatXp",
    STRENGTH: "lifetimeStrengthXp",
    HONOR: "lifetimeHonorXp",
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
function nonNegative(value, code) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number) || number < 0)
        throw new Error(code);
    return number;
}
function resolveLifetimeDomain(kindInput) {
    const kind = String(kindInput ?? "").trim().toUpperCase();
    if (kind === "STRENGTH")
        return "STRENGTH";
    if (kind === "HONOR")
        return "HONOR";
    if (kind === "ATTENDANCE" || kind === "DAILY_GRIND"
        || kind.startsWith("ARENA/") || kind.startsWith("CHAMPIONSHIP/"))
        return "COMBAT";
    throw new Error(`UNRESOLVED_LIFETIME_DOMAIN:${kind || "EMPTY"}`);
}
function resolveLifetimeXpState(athlete) {
    const combat = nonNegative(athlete?.lifetimeCombatXp, "INVALID_LIFETIME_COMBAT_XP");
    const strength = nonNegative(athlete?.lifetimeStrengthXp, "INVALID_LIFETIME_STRENGTH_XP");
    const honor = nonNegative(athlete?.lifetimeHonorXp, "INVALID_LIFETIME_HONOR_XP");
    const componentTotal = combat + strength + honor;
    const storedCombined = nonNegative(athlete?.lifetimeXp, "INVALID_LIFETIME_XP");
    const hasSchema = athlete?.lifetimeXpSchemaVersion === exports.LIFETIME_XP_SCHEMA_VERSION;
    const legacy = hasSchema
        ? nonNegative(athlete?.lifetimeLegacyXp, "INVALID_LIFETIME_LEGACY_XP")
        : storedCombined;
    const combined = legacy + componentTotal;
    if (hasSchema && storedCombined !== combined) {
        throw new Error("LIFETIME_XP_INVARIANT_VIOLATION");
    }
    return Object.freeze({ legacy, combat, strength, honor, combined,
        reconciliationStatus: legacy > 0 ? "legacy_unreconciled" : "componentized" });
}
function resolveManagementAdjustmentSemantic(categoryInput, explicitSemantic) {
    const category = String(categoryInput ?? "").trim().toLowerCase();
    if (category === "delayed_onboarding" || category === "paper_reconciliation") {
        return "NEW_EARNED_XP";
    }
    if (category === "downtime_recovery") {
        return explicitSemantic ?? "NEW_EARNED_XP";
    }
    if (category === "correction") {
        if (!explicitSemantic)
            throw new Error("CORRECTION_REQUIRES_EXPLICIT_XP_SEMANTIC");
        return explicitSemantic;
    }
    throw new Error(`UNSUPPORTED_MANAGEMENT_XP_CATEGORY:${category || "EMPTY"}`);
}
function resolveLifetimeXpEffects(args) {
    const state = resolveLifetimeXpState(args.athlete);
    const semantic = args.semantic ?? "NEW_EARNED_XP";
    const operationalDelta = Number(args.operationalDelta);
    if (!Number.isFinite(operationalDelta))
        throw new Error("INVALID_OPERATIONAL_DELTA");
    let lifetimeDelta = Number(args.lifetimeDelta ?? 0);
    if (semantic === "NEW_EARNED_XP" || semantic === "RECOGNIZED_PRIOR_EXPERIENCE") {
        lifetimeDelta = Math.max(0, operationalDelta);
    }
    else if (semantic === "RESTORE_ALREADY_COUNTED_XP" || semantic === "OPERATIONAL_DEDUCTION") {
        lifetimeDelta = 0;
    }
    else if (semantic === "HISTORICAL_LIFETIME_RECONCILIATION") {
        if (!Number.isFinite(lifetimeDelta))
            throw new Error("INVALID_LIFETIME_DELTA");
    }
    else if (semantic === "REVERSE_ERRONEOUS_AWARD") {
        if (!Number.isFinite(lifetimeDelta) || lifetimeDelta >= 0) {
            throw new Error("REVERSAL_REQUIRES_NEGATIVE_LIFETIME_DELTA");
        }
    }
    else if (semantic === "DOMAIN_RECLASSIFICATION") {
        throw new Error("DOMAIN_RECLASSIFICATION_REQUIRES_TWO_COMPONENT_TRANSACTION");
    }
    const key = args.domain.toLowerCase();
    const componentBefore = state[key];
    const componentAfter = componentBefore + lifetimeDelta;
    if (componentAfter < 0)
        throw new Error("LIFETIME_COMPONENT_UNDERFLOW");
    const combinedAfter = state.combined + lifetimeDelta;
    const stateAfter = Object.freeze({ ...state, [key]: componentAfter, combined: combinedAfter });
    return Object.freeze({ domain: args.domain, componentField: COMPONENT_FIELDS[args.domain], semantic,
        operationalDelta, componentBefore, componentAfter, lifetimeComponentDelta: lifetimeDelta,
        combinedBefore: state.combined, combinedAfter, combinedLifetimeDelta: lifetimeDelta, stateAfter });
}
function assertLifetimeInvariant(state) {
    if (state.combined !== state.legacy + state.combat + state.strength + state.honor) {
        throw new Error("LIFETIME_XP_INVARIANT_VIOLATION");
    }
    return true;
}
function lifetimeXpPatch(effects) {
    assertLifetimeInvariant(effects.stateAfter);
    return {
        [effects.componentField]: effects.componentAfter,
        lifetimeLegacyXp: effects.stateAfter.legacy,
        lifetimeXp: effects.combinedAfter,
        lifetimeXpSchemaVersion: exports.LIFETIME_XP_SCHEMA_VERSION,
        lifetimeXpReconciliationStatus: effects.stateAfter.reconciliationStatus,
    };
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
