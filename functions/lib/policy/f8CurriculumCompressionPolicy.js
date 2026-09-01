"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.F8_CURRICULUM_COMPRESSION_POLICY = exports.F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE = exports.F8_CURRICULUM_CONTENT_ROLES = exports.F8_CURRICULUM_COMPRESSION_VERSION = void 0;
exports.isF8LegacyCurriculumIdentifier = isF8LegacyCurriculumIdentifier;
exports.isLegacyF8CurriculumRouteValid = isLegacyF8CurriculumRouteValid;
exports.isF8CurriculumCompressionSupported = isF8CurriculumCompressionSupported;
exports.resolveF8CurriculumCompressionMetadata = resolveF8CurriculumCompressionMetadata;
exports.resolveF8CurriculumStageMetadata = resolveF8CurriculumStageMetadata;
exports.isF8CurriculumBridgeStage = isF8CurriculumBridgeStage;
exports.resolveRoad2ChampionRankContainer = resolveRoad2ChampionRankContainer;
const f8CurriculumCompatibilityPolicy_1 = require("./f8CurriculumCompatibilityPolicy");
const f8ProgressionPolicy_1 = require("./f8ProgressionPolicy");
exports.F8_CURRICULUM_COMPRESSION_VERSION = "f8-road2champion-curriculum-compression-v1";
exports.F8_CURRICULUM_CONTENT_ROLES = Object.freeze([
    "foundation",
    "development",
    "bridge",
    "review",
    "mastery",
]);
const LEGACY_IDENTIFIERS = Object.freeze([
    "f8",
    "foundry8",
    "foundry-8",
    "youth",
    "z2h",
    "zero2hero",
]);
const ROUTED_DISCIPLINES = Object.freeze([
    "wrestling",
    "boxing",
    "kickboxing",
]);
function frozenStage(curriculumTier, rankTiers, roles, segments = []) {
    return Object.freeze({
        curriculumTier,
        rankTiers: Object.freeze([...rankTiers]),
        roles: Object.freeze([...roles]),
        bridge: segments.length > 0,
        requiresCardMetadata: segments.length > 0,
        segments: Object.freeze(segments.map((segment) => Object.freeze({ ...segment }))),
    });
}
function disciplineStages() {
    return Object.freeze([
        frozenStage("T0", ["T0"], ["foundation"]),
        frozenStage("T1", ["T1"], ["development"]),
        frozenStage("T2", ["T1", "T2"], ["foundation", "bridge", "development"], [
            { id: "foundation", rankTier: "T1", role: "foundation" },
            { id: "application", rankTier: "T2", role: "development" },
        ]),
        frozenStage("T3", ["T2"], ["development", "review"]),
        frozenStage("T4", ["T3"], ["development"]),
        frozenStage("T5", ["T3", "T4"], ["development", "bridge", "mastery"], [
            { id: "development", rankTier: "T3", role: "development" },
            { id: "champion-preparation", rankTier: "T4", role: "mastery" },
        ]),
        frozenStage("T6", ["T4"], ["development", "review"]),
        frozenStage("T7", ["T4"], ["review", "mastery"]),
    ]);
}
exports.F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE = Object.freeze({
    wrestling: disciplineStages(),
    boxing: disciplineStages(),
    kickboxing: disciplineStages(),
});
exports.F8_CURRICULUM_COMPRESSION_POLICY = Object.freeze({
    version: exports.F8_CURRICULUM_COMPRESSION_VERSION,
    progressionTiers: Object.freeze(f8ProgressionPolicy_1.F8_RANKS.map((rank) => rank.tier)),
    curriculumTiers: f8CurriculumCompatibilityPolicy_1.F8_CURRICULUM_TIERS,
    legacyIdentifiers: LEGACY_IDENTIFIERS,
    supportedDisciplines: Object.freeze(["wrestling", "boxing", "kickboxing"]),
    unimplementedDisciplines: Object.freeze([]),
    disciplines: exports.F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE,
});
function normalized(value) {
    return String(value ?? "").trim().toLowerCase();
}
function normalizeDiscipline(value) {
    const discipline = normalized(value).replace(/[\s_-]+/g, "");
    if (discipline === "wrestling" || discipline === "wrestle")
        return "wrestling";
    if (discipline === "boxing" || discipline === "box")
        return "boxing";
    if (discipline === "kickboxing" || discipline === "kickbox" || discipline === "muaythai") {
        return "kickboxing";
    }
    return null;
}
function normalizeCurriculumTier(value) {
    const tier = String(value ?? "").trim().toUpperCase();
    return f8CurriculumCompatibilityPolicy_1.F8_CURRICULUM_TIERS.includes(tier)
        ? tier
        : null;
}
function isF8LegacyCurriculumIdentifier(value) {
    return LEGACY_IDENTIFIERS.includes(normalized(value));
}
function isLegacyF8CurriculumRouteValid(discipline, curriculumTier) {
    const normalizedDiscipline = normalizeDiscipline(discipline);
    return normalizedDiscipline !== null &&
        ROUTED_DISCIPLINES.includes(normalizedDiscipline) &&
        normalizeCurriculumTier(curriculumTier) !== null;
}
function isF8CurriculumCompressionSupported(discipline) {
    const normalizedDiscipline = normalizeDiscipline(discipline);
    return normalizedDiscipline !== null;
}
function resolveF8CurriculumCompressionMetadata(discipline) {
    const normalizedDiscipline = normalizeDiscipline(discipline);
    if (!normalizedDiscipline) {
        throw new RangeError(`F8_CURRICULUM_COMPRESSION_UNKNOWN_DISCIPLINE: ${String(discipline)}`);
    }
    return exports.F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE[normalizedDiscipline];
}
function resolveF8CurriculumStageMetadata(discipline, curriculumTier) {
    const tier = normalizeCurriculumTier(curriculumTier);
    if (!tier) {
        throw new RangeError(`Unknown Foundry 8 curriculum tier: ${String(curriculumTier)}`);
    }
    const stage = resolveF8CurriculumCompressionMetadata(discipline)
        .find((candidate) => candidate.curriculumTier === tier);
    if (!stage)
        throw new RangeError(`Missing Foundry 8 curriculum mapping: ${tier}`);
    return stage;
}
function isF8CurriculumBridgeStage(discipline, curriculumTier) {
    return resolveF8CurriculumStageMetadata(discipline, curriculumTier).bridge;
}
function resolveRoad2ChampionRankContainer(discipline, curriculumTier, bridgeSegment) {
    const stage = resolveF8CurriculumStageMetadata(discipline, curriculumTier);
    if (!stage.bridge)
        return stage.rankTiers[0];
    const segment = normalized(bridgeSegment);
    if (!segment)
        return null;
    return stage.segments.find((candidate) => candidate.id === segment)?.rankTier ?? null;
}
