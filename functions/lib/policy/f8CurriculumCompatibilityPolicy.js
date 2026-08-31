"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.F8_CURRICULUM_TIERS = exports.F8_CURRICULUM_COMPATIBILITY_VERSION = void 0;
exports.inspectF8TierCompatibility = inspectF8TierCompatibility;
exports.resolveF8ProgressionTier = resolveF8ProgressionTier;
exports.resolveF8CurriculumTier = resolveF8CurriculumTier;
const https_1 = require("firebase-functions/v2/https");
const f8ProgressionPolicy_1 = require("./f8ProgressionPolicy");
exports.F8_CURRICULUM_COMPATIBILITY_VERSION = "f8-curriculum-bridge-v1";
exports.F8_CURRICULUM_TIERS = Object.freeze([
    "T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7",
]);
function normalizedTier(value) {
    return String(value ?? "").trim().toUpperCase();
}
function isProgressionTier(value) {
    return /^T[0-4]$/.test(value);
}
function isCurriculumTier(value) {
    return exports.F8_CURRICULUM_TIERS.includes(value);
}
function legacyTier(athlete) {
    return normalizedTier(athlete?.tier ?? athlete?.tierCode ?? athlete?.currentTier);
}
function inspectF8TierCompatibility(athlete) {
    const progressionTier = normalizedTier(athlete?.progressionTier);
    const curriculumTier = normalizedTier(athlete?.curriculumTier);
    const legacy = legacyTier(athlete);
    const warnings = [];
    if (progressionTier && !isProgressionTier(progressionTier))
        warnings.push("INVALID_PROGRESSION_TIER");
    if (curriculumTier && !isCurriculumTier(curriculumTier))
        warnings.push("INVALID_CURRICULUM_TIER");
    if (legacy && !isCurriculumTier(legacy))
        warnings.push("INVALID_LEGACY_TIER");
    if (progressionTier && legacy && progressionTier !== legacy) {
        warnings.push("PROGRESSION_LEGACY_TIER_CONFLICT");
    }
    const state = warnings.length ? "REVIEW_REQUIRED"
        : progressionTier && curriculumTier ? "EXPLICIT" : "LEGACY_READ_ONLY";
    return Object.freeze({
        version: exports.F8_CURRICULUM_COMPATIBILITY_VERSION,
        state,
        progressionTier: isProgressionTier(progressionTier) ? progressionTier : null,
        curriculumTier: isCurriculumTier(curriculumTier)
            ? curriculumTier : isCurriculumTier(legacy) ? legacy : null,
        legacyTier: isCurriculumTier(legacy) ? legacy : null,
        warnings: Object.freeze(warnings),
    });
}
function resolveF8ProgressionTier(athlete) {
    const inspection = inspectF8TierCompatibility(athlete);
    if (inspection.state === "REVIEW_REQUIRED") {
        throw new https_1.HttpsError("failed-precondition", inspection.warnings.join(","));
    }
    if (inspection.progressionTier)
        return inspection.progressionTier;
    const legacy = inspection.legacyTier;
    if (legacy && isProgressionTier(legacy)) {
        const rank = (0, f8ProgressionPolicy_1.resolveF8RankMetadata)(legacy);
        const rankName = String(athlete?.rankName ?? athlete?.rank ?? "").trim().toLowerCase();
        if (rankName === rank.name.toLowerCase())
            return legacy;
    }
    throw new https_1.HttpsError("failed-precondition", "F8_PROGRESSION_TIER_REVIEW_REQUIRED");
}
function resolveF8CurriculumTier(athlete) {
    const inspection = inspectF8TierCompatibility(athlete);
    if (!inspection.curriculumTier || inspection.warnings.includes("INVALID_CURRICULUM_TIER")) {
        throw new https_1.HttpsError("failed-precondition", "F8_CURRICULUM_TIER_REVIEW_REQUIRED");
    }
    return inspection.curriculumTier;
}
