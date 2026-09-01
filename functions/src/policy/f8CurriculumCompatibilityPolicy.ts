import { HttpsError } from "firebase-functions/v2/https";
import { resolveF8RankMetadata, type F8RankReference } from "./f8ProgressionPolicy";

export const F8_CURRICULUM_COMPATIBILITY_VERSION = "f8-curriculum-bridge-v1" as const;
export const F8_CURRICULUM_TIERS = Object.freeze([
  "T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7",
] as const);

export type F8CurriculumTier = (typeof F8_CURRICULUM_TIERS)[number];
export type F8CompatibilityState = "EXPLICIT" | "LEGACY_READ_ONLY" | "REVIEW_REQUIRED";

function normalizedTier(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isProgressionTier(value: string): value is F8RankReference {
  return /^T[0-4]$/.test(value);
}

function isCurriculumTier(value: string): value is F8CurriculumTier {
  return F8_CURRICULUM_TIERS.includes(value as F8CurriculumTier);
}

function legacyTier(athlete: any): string {
  return normalizedTier(athlete?.tier ?? athlete?.tierCode ?? athlete?.currentTier);
}

function isLegacyFiveRankNameCompatible(tier: string, rankName: string): boolean {
  return tier === "T4" && rankName === "hero";
}

export function inspectF8TierCompatibility(athlete: any) {
  const progressionTier = normalizedTier(athlete?.progressionTier);
  const curriculumTier = normalizedTier(athlete?.curriculumTier);
  const legacy = legacyTier(athlete);
  const warnings: string[] = [];

  if (progressionTier && !isProgressionTier(progressionTier)) warnings.push("INVALID_PROGRESSION_TIER");
  if (curriculumTier && !isCurriculumTier(curriculumTier)) warnings.push("INVALID_CURRICULUM_TIER");
  if (legacy && !isCurriculumTier(legacy)) warnings.push("INVALID_LEGACY_TIER");
  if (progressionTier && legacy && progressionTier !== legacy) {
    warnings.push("PROGRESSION_LEGACY_TIER_CONFLICT");
  }

  const state: F8CompatibilityState = warnings.length ? "REVIEW_REQUIRED"
    : progressionTier && curriculumTier ? "EXPLICIT" : "LEGACY_READ_ONLY";
  return Object.freeze({
    version: F8_CURRICULUM_COMPATIBILITY_VERSION,
    state,
    progressionTier: isProgressionTier(progressionTier) ? progressionTier : null,
    curriculumTier: isCurriculumTier(curriculumTier)
      ? curriculumTier : isCurriculumTier(legacy) ? legacy : null,
    legacyTier: isCurriculumTier(legacy) ? legacy : null,
    warnings: Object.freeze(warnings),
  });
}

export function resolveF8ProgressionTier(athlete: any): F8RankReference {
  const inspection = inspectF8TierCompatibility(athlete);
  if (inspection.state === "REVIEW_REQUIRED") {
    throw new HttpsError("failed-precondition", inspection.warnings.join(","));
  }
  if (inspection.progressionTier) return inspection.progressionTier;

  const legacy = inspection.legacyTier;
  if (legacy && isProgressionTier(legacy)) {
    const rank = resolveF8RankMetadata(legacy);
    const rankName = String(athlete?.rankName ?? athlete?.rank ?? "").trim().toLowerCase();
    if (
      rankName === rank.name.toLowerCase() ||
      isLegacyFiveRankNameCompatible(legacy, rankName)
    ) return legacy;
  }
  throw new HttpsError("failed-precondition", "F8_PROGRESSION_TIER_REVIEW_REQUIRED");
}

export function resolveF8CurriculumTier(athlete: any): F8CurriculumTier {
  const inspection = inspectF8TierCompatibility(athlete);
  if (!inspection.curriculumTier || inspection.warnings.includes("INVALID_CURRICULUM_TIER")) {
    throw new HttpsError("failed-precondition", "F8_CURRICULUM_TIER_REVIEW_REQUIRED");
  }
  return inspection.curriculumTier;
}
