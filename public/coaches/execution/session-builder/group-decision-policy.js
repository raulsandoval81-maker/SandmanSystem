// Shared AUTO / HYBRID group decision policy.
// Curriculum availability is not athlete progression evidence.
export function assessGroupRecommendation({groupId, tier, journeyMatches, discipline, hasModel, waves, cardFamilyMap = {}}) {
  if (!hasModel || !journeyMatches || discipline === "boxing" || !/^t[0-4]$/.test(tier)) {
    return {groupId, tier, status:"unavailable", progressionStatus:"unverified", progressionVerified:false, mappingStatus:"incomplete", waveKey:"", cards:[]};
  }
  const available = (waves || []).filter(([, cards]) => Array.isArray(cards) && cards.length);
  // Preview fallback ONLY. A future authoritative evidence resolver must choose
  // by verified athlete history; this fallback never confers AUTO eligibility.
  const [waveKey, cards] = available[0] || ["", []];
  const mapped = cards.map(card => ({
    ...card, familyId: cardFamilyMap[String(card.id || "").toLowerCase()] || "",
    groupId, groupLabel: groupId
  }));
  return {
    groupId, tier, waveKey, status:cards.length ? "ready" : "unavailable",
    progressionStatus:"unverified", progressionVerified:false,
    mappingStatus:mapped.length && mapped.every(card => card.familyId) ? "mapped" : "incomplete",
    cards:mapped
  };
}

export function canLaunchAuto(groups, prescriptions) {
  return Array.isArray(groups) && groups.length > 0
    && Array.isArray(prescriptions)
    && prescriptions.length === groups.length
    && prescriptions.every(p => p.status === "ready" && p.progressionVerified === true);
}
