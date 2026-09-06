"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.F8_SHADOW_ACTS_GATEWAY = exports.F8_REMOTE_ACCESS_GATEWAY = void 0;
exports.hasReachedF8RemoteAccessGateway = hasReachedF8RemoteAccessGateway;
exports.resolveF8ShadowActs = resolveF8ShadowActs;
exports.resolveF8RemoteAccess = resolveF8RemoteAccess;
exports.F8_REMOTE_ACCESS_GATEWAY = Object.freeze({
    progressionTier: "T1",
    stripeCount: 1,
});
exports.F8_SHADOW_ACTS_GATEWAY = Object.freeze({
    combat: 1,
    strength: 2,
    honor: 3,
});
function tierIndex(value) {
    const match = String(value ?? "").trim().toUpperCase().match(/^T([0-4])$/);
    return match ? Number(match[1]) : null;
}
function hasReachedF8RemoteAccessGateway(progressionTier, stripeCount) {
    const tier = tierIndex(progressionTier);
    if (tier === null)
        return false;
    return tier > 1 || (tier === 1 && Number(stripeCount ?? 0) >= 1);
}
function resolveF8ShadowActs(athlete) {
    const tier = tierIndex(athlete?.progressionTier ?? athlete?.tier);
    const stripes = Number(athlete?.stripeCount ?? athlete?.stripesEarned ?? 0);
    if (tier !== 0) {
        return Object.freeze({
            combat: false,
            strength: false,
            honor: false,
        });
    }
    return Object.freeze({
        combat: stripes >= exports.F8_SHADOW_ACTS_GATEWAY.combat,
        strength: stripes >= exports.F8_SHADOW_ACTS_GATEWAY.strength,
        honor: stripes >= exports.F8_SHADOW_ACTS_GATEWAY.honor,
    });
}
function resolveF8RemoteAccess(athlete) {
    const tier = tierIndex(athlete?.progressionTier ?? athlete?.tier);
    const gatewayReached = hasReachedF8RemoteAccessGateway(athlete?.progressionTier ?? athlete?.tier, athlete?.stripeCount ?? athlete?.stripesEarned);
    const athleteAssignmentsAllowed = tier !== null && tier > 0;
    return Object.freeze({
        combat: athleteAssignmentsAllowed && gatewayReached,
        strength: athleteAssignmentsAllowed && (athlete?.unlocks?.strength === true || gatewayReached),
        honor: athleteAssignmentsAllowed && (athlete?.unlocks?.honor === true || gatewayReached),
        gatewayReached,
    });
}
