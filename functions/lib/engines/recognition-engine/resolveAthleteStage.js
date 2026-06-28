"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAthleteStage = resolveAthleteStage;
function num(v) {
    return Number(v ?? 0);
}
function normalize(v) {
    return String(v ?? "").trim().toLowerCase();
}
function hasPassedTest(a) {
    return normalize(a?.testing?.lastTestResult) === "pass";
}
function isTestingActive(a) {
    return normalize(a?.testing?.state) === "active";
}
function inCooldown(a) {
    return Boolean(a?.cooldownUntil &&
        new Date(a.cooldownUntil).getTime() > Date.now());
}
function isTemple(a) {
    const xp = num(a.xp);
    const cap = num(a.xpCap);
    const ratio = cap > 0 ? xp / cap : 0;
    return ratio >= 0.9 && !a?.testing?.testScheduledAt;
}
function isTestEligible(a) {
    return Boolean(a?.testing?.testEligibleAt &&
        !a?.testing?.testScheduledAt);
}
function isTestScheduled(a) {
    return Boolean(a?.testing?.testScheduledAt);
}
function isCeremony(a) {
    return Boolean(a?.promotionCompletedAt &&
        !a?.ceremonyCompletedAt);
}
function resolveAthleteStage(a) {
    const stripe = num(a.stripeCount ?? a.stripe ?? 0);
    // 💤 1. COOLDOWN (highest priority safe state)
    if (inCooldown(a)) {
        return "COOLDOWN";
    }
    // 🏆 2. CEREMONY (post-promotion recognition)
    if (isCeremony(a)) {
        return "CEREMONY";
    }
    // ⬆ 3. PROMOTION (passed test, awaiting transition)
    if (hasPassedTest(a)) {
        return "PROMOTION";
    }
    // 🧪 4. TESTING (active evaluation)
    if (isTestingActive(a)) {
        return "TESTING";
    }
    // 🔵 5. TEST SCHEDULED (locked in)
    if (isTestScheduled(a)) {
        return "TEST_SCHEDULED";
    }
    // 🟡 6. TEST ELIGIBLE (coach can act)
    if (isTestEligible(a)) {
        return "TEST_ELIGIBLE";
    }
    // 🟠 7. TEMPLE (readiness pressure zone)
    if (isTemple(a)) {
        return "TEMPLE";
    }
    // 🟢 8. STRIPE PROGRESSION (default active loop)
    if (stripe > 0) {
        return "STRIPE_PROGRESS";
    }
    return "DONE";
}
