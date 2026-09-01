import {
  F8_CURRICULUM_TIERS,
  type F8CurriculumTier,
} from "./f8CurriculumCompatibilityPolicy";
import {
  F8_RANKS,
  type F8Tier,
} from "./f8ProgressionPolicy";

export const F8_CURRICULUM_COMPRESSION_VERSION =
  "f8-road2champion-curriculum-compression-v1" as const;

export const F8_CURRICULUM_CONTENT_ROLES = Object.freeze([
  "foundation",
  "development",
  "bridge",
  "review",
  "mastery",
] as const);

export type F8CurriculumContentRole =
  (typeof F8_CURRICULUM_CONTENT_ROLES)[number];
export type F8CurriculumDiscipline = "wrestling" | "boxing" | "kickboxing";

export type F8BridgeSegment = Readonly<{
  id: string;
  rankTier: F8Tier;
  role: F8CurriculumContentRole;
}>;

export type F8CurriculumStageMetadata = Readonly<{
  curriculumTier: F8CurriculumTier;
  rankTiers: readonly F8Tier[];
  roles: readonly F8CurriculumContentRole[];
  bridge: boolean;
  requiresCardMetadata: boolean;
  segments: readonly F8BridgeSegment[];
}>;

const LEGACY_IDENTIFIERS = Object.freeze([
  "f8",
  "foundry8",
  "foundry-8",
  "youth",
  "z2h",
  "zero2hero",
] as const);

const ROUTED_DISCIPLINES = Object.freeze([
  "wrestling",
  "boxing",
  "kickboxing",
] as const);

function frozenStage(
  curriculumTier: F8CurriculumTier,
  rankTiers: readonly F8Tier[],
  roles: readonly F8CurriculumContentRole[],
  segments: readonly F8BridgeSegment[] = []
): F8CurriculumStageMetadata {
  return Object.freeze({
    curriculumTier,
    rankTiers: Object.freeze([...rankTiers]),
    roles: Object.freeze([...roles]),
    bridge: segments.length > 0,
    requiresCardMetadata: segments.length > 0,
    segments: Object.freeze(segments.map((segment) => Object.freeze({ ...segment }))),
  });
}

function disciplineStages(): readonly F8CurriculumStageMetadata[] {
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

export const F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE = Object.freeze({
  wrestling: disciplineStages(),
  boxing: disciplineStages(),
  kickboxing: disciplineStages(),
});

export const F8_CURRICULUM_COMPRESSION_POLICY = Object.freeze({
  version: F8_CURRICULUM_COMPRESSION_VERSION,
  progressionTiers: Object.freeze(F8_RANKS.map((rank) => rank.tier)),
  curriculumTiers: F8_CURRICULUM_TIERS,
  legacyIdentifiers: LEGACY_IDENTIFIERS,
  supportedDisciplines: Object.freeze(["wrestling", "boxing", "kickboxing"] as const),
  unimplementedDisciplines: Object.freeze([] as const),
  disciplines: F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE,
});

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDiscipline(value: unknown): F8CurriculumDiscipline | null {
  const discipline = normalized(value).replace(/[\s_-]+/g, "");
  if (discipline === "wrestling" || discipline === "wrestle") return "wrestling";
  if (discipline === "boxing" || discipline === "box") return "boxing";
  if (discipline === "kickboxing" || discipline === "kickbox" || discipline === "muaythai") {
    return "kickboxing";
  }
  return null;
}

function normalizeCurriculumTier(value: unknown): F8CurriculumTier | null {
  const tier = String(value ?? "").trim().toUpperCase();
  return F8_CURRICULUM_TIERS.includes(tier as F8CurriculumTier)
    ? tier as F8CurriculumTier
    : null;
}

export function isF8LegacyCurriculumIdentifier(value: unknown): boolean {
  return LEGACY_IDENTIFIERS.includes(normalized(value) as (typeof LEGACY_IDENTIFIERS)[number]);
}

export function isLegacyF8CurriculumRouteValid(
  discipline: unknown,
  curriculumTier: unknown
): boolean {
  const normalizedDiscipline = normalizeDiscipline(discipline);
  return normalizedDiscipline !== null &&
    ROUTED_DISCIPLINES.includes(normalizedDiscipline) &&
    normalizeCurriculumTier(curriculumTier) !== null;
}

export function isF8CurriculumCompressionSupported(discipline: unknown): boolean {
  const normalizedDiscipline = normalizeDiscipline(discipline);
  return normalizedDiscipline !== null;
}

export function resolveF8CurriculumCompressionMetadata(
  discipline: unknown
): readonly F8CurriculumStageMetadata[] {
  const normalizedDiscipline = normalizeDiscipline(discipline);
  if (!normalizedDiscipline) {
    throw new RangeError(`F8_CURRICULUM_COMPRESSION_UNKNOWN_DISCIPLINE: ${String(discipline)}`);
  }
  return F8_CURRICULUM_COMPRESSION_BY_DISCIPLINE[normalizedDiscipline];
}

export function resolveF8CurriculumStageMetadata(
  discipline: unknown,
  curriculumTier: unknown
): F8CurriculumStageMetadata {
  const tier = normalizeCurriculumTier(curriculumTier);
  if (!tier) {
    throw new RangeError(`Unknown Foundry 8 curriculum tier: ${String(curriculumTier)}`);
  }
  const stage = resolveF8CurriculumCompressionMetadata(discipline)
    .find((candidate) => candidate.curriculumTier === tier);
  if (!stage) throw new RangeError(`Missing Foundry 8 curriculum mapping: ${tier}`);
  return stage;
}

export function isF8CurriculumBridgeStage(
  discipline: unknown,
  curriculumTier: unknown
): boolean {
  return resolveF8CurriculumStageMetadata(discipline, curriculumTier).bridge;
}

export function resolveRoad2ChampionRankContainer(
  discipline: unknown,
  curriculumTier: unknown,
  bridgeSegment?: unknown
): F8Tier | null {
  const stage = resolveF8CurriculumStageMetadata(discipline, curriculumTier);
  if (!stage.bridge) return stage.rankTiers[0];

  const segment = normalized(bridgeSegment);
  if (!segment) return null;
  return stage.segments.find((candidate) => candidate.id === segment)?.rankTier ?? null;
}
