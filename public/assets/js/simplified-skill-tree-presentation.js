const FAMILY_STATE_LABELS = Object.freeze({ LEARNED: "Learned", APPLIED: "Applied", MASTERED: "Mastered", REFINED: "Refined" });

export function escapeSkillTreeText(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function normalizeFiveTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  return /^T[0-4]$/.test(tier) ? tier : "T0";
}

export function familyProgressById(skills) {
  return new Map((Array.isArray(skills) ? skills : [])
    .map((skill) => [String(skill.familyId || ""), FAMILY_STATE_LABELS[String(skill.state || "").toUpperCase()]])
    .filter(([familyId, label]) => familyId && label));
}

export function progressPresentation(entry, familyProgress) {
  const relatedFamilyState = entry.familyId ? familyProgress.get(entry.familyId) || "" : "";
  return relatedFamilyState
    ? { exactState: "Exact skill status unknown", relatedState: `Related skill family: ${relatedFamilyState}` }
    : { exactState: "Not yet individually verified", relatedState: "" };
}

export function familyLabel(familyId) {
  return String(familyId || "").split("_").filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

export function groupFiveTierPlacements(manifest) {
  return Object.entries(manifest.rankNames).map(([tier, rankName]) => ({
    tier, rankName, skills: manifest.placements.filter((entry) => entry.tier === tier),
  }));
}
