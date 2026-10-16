export const YOUTH_SKILL_TREE_RANKS = Object.freeze([
  Object.freeze({ placement: "T0", name: "Shadow" }),
  Object.freeze({ placement: "T1", name: "Prospect" }),
  Object.freeze({ placement: "T2", name: "Competitor" }),
  Object.freeze({ placement: "T3", name: "Contender" }),
  Object.freeze({ placement: "T4", name: "Champion" }),
  Object.freeze({ placement: "CHAMPION_EXTENDED_DEVELOPMENT", name: "Champion Extended Development" }),
]);

const FAMILY_STATE_LABELS = Object.freeze({ LEARNED: "Learned", APPLIED: "Applied", MASTERED: "Mastered", REFINED: "Refined" });

export function normalizeProgressionTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (/^T[0-4]$/.test(tier)) return tier;
  if (/^T[5-7]$/.test(tier)) return "T4";
  return "T0";
}

export function normalizeCurriculumTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  return /^T[0-7]$/.test(tier) ? tier : "T0";
}

const normalizeProgressKey = (value) => String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");

export function resolveSkillTreeTiers(athlete, progressKeys, allowLegacyRootFallback = false) {
  const keys = (Array.isArray(progressKeys) ? progressKeys : []).map(normalizeProgressKey);
  const containers = [athlete?.disciplines, athlete?.combat, athlete?.progression, athlete?.disciplineProgress];
  const progress = containers.flatMap((records) => records && typeof records === "object" ? Object.entries(records) : [])
    .find(([key]) => keys.includes(normalizeProgressKey(key)))?.[1] || null;
  const legacyRoot = allowLegacyRootFallback ? athlete || {} : {};
  return {
    progressionTier: normalizeProgressionTier(progress?.progressionTier || progress?.tier || progress?.currentTier || legacyRoot.progressionTier || legacyRoot.tier),
    curriculumTier: normalizeCurriculumTier(progress?.curriculumTier || progress?.tier || progress?.currentTier || legacyRoot.curriculumTier || legacyRoot.tier),
  };
}

export function canViewPlacement(placement, progressionTier, curriculumTier) {
  if (placement === "CHAMPION_EXTENDED_DEVELOPMENT") return normalizeCurriculumTier(curriculumTier) === "T7";
  return Number(placement.slice(1)) <= Number(normalizeProgressionTier(progressionTier).slice(1));
}

export function groupPlacements(placements) {
  return YOUTH_SKILL_TREE_RANKS.map((rank) => ({ ...rank, skills: placements.filter((entry) => entry.placement === rank.placement) }));
}

export function familyProgressById(skills) {
  return new Map((Array.isArray(skills) ? skills : [])
    .map((skill) => [String(skill.familyId || ""), FAMILY_STATE_LABELS[String(skill.state || "").toUpperCase()]])
    .filter(([familyId, label]) => familyId && label));
}

export function progressPresentation(entry, familyProgress) {
  const relatedFamilyState = familyProgress.get(entry.familyId) || "";
  return relatedFamilyState
    ? { exactState: "Exact skill status unknown", relatedState: `Related skill family: ${relatedFamilyState}` }
    : { exactState: "Not yet individually verified", relatedState: "" };
}

export function familyLabel(familyId) {
  return String(familyId || "").split("_").filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}
