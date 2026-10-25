export const HYBRID_PLANNING_SOURCES = Object.freeze(["tierWaves", "systemSuggestions", "coachInput"]);

export const DEFAULT_HYBRID_PLANNING_SOURCES = Object.freeze({
  tierWaves: false,
  systemSuggestions: false,
  coachInput: false
});

export function normalizePlanningSources(value = {}, mode = "hybrid") {
  if (mode !== "hybrid") return Object.fromEntries(HYBRID_PLANNING_SOURCES.map(key => [key, false]));
  const hasExplicitSelection = HYBRID_PLANNING_SOURCES.some(key => Object.hasOwn(value || {}, key));
  return Object.fromEntries(HYBRID_PLANNING_SOURCES.map(key => [
    key,
    hasExplicitSelection ? value[key] === true : DEFAULT_HYBRID_PLANNING_SOURCES[key]
  ]));
}

export function enabledPlanningSources(value = {}, mode = "hybrid") {
  const normalized = normalizePlanningSources(value, mode);
  return HYBRID_PLANNING_SOURCES.filter(key => normalized[key]);
}

export function composeGroupPlanning({ group = {}, sources = {}, wave = null, prior = {} } = {}) {
  const enabled = normalizePlanningSources(sources, "hybrid");
  const acceptedWave = enabled.tierWaves && wave?.waveKey ? {
    waveKey: String(wave.waveKey),
    instructionalTier: String(group.tier || "").toLowerCase(),
    cards: Array.isArray(wave.cards) ? wave.cards : [],
    state: "accepted",
    progressionVerified: false,
    provenance: "approved-tier-wave"
  } : null;
  return {
    groupId: String(group.id || ""),
    sources: enabled,
    tierWave: acceptedWave,
    systemSuggestion: enabled.systemSuggestions ? {
      state: "unavailable",
      evidenceStatus: "missing-authoritative-recommendation",
      progressionVerified: false,
      reason: "Authoritative athlete-history recommendations are not connected to Session Builder."
    } : null,
    coachInput: enabled.coachInput ? {
      originalCarryForwardNote: String(prior.originalCarryForwardNote ?? group.carryForwardNote ?? "").trim(),
      currentNote: String(prior.currentNote || "").trim(),
      disposition: ["accepted", "edited", "dismissed", "replaced"].includes(prior.disposition)
        ? prior.disposition
        : (group.carryForwardNote ? "accepted" : "replaced"),
      establishesMastery: false
    } : null
  };
}

export function acceptedCardsForGroup(planning = {}) {
  return planning?.tierWave?.state === "accepted" && planning?.tierWave?.progressionVerified === false
    ? (Array.isArray(planning.tierWave.cards) ? planning.tierWave.cards : [])
    : [];
}

export function editableGroupPlanning(prior = {}, group = {}) {
  const coachInput = prior?.coachInput || {};
  const currentTier = String(group.tier || "").toLowerCase();
  const priorTier = String(prior?.instructionalTier || prior?.tierWave?.instructionalTier || "").toLowerCase();
  const tierChanged = Boolean(priorTier && priorTier !== currentTier);
  return {
    selectedWave: tierChanged ? "" : String(prior?.selectedWave || prior?.tierWave?.waveKey || ""),
    ...(currentTier ? { instructionalTier: currentTier } : {}),
    originalCarryForwardNote: String(prior?.originalCarryForwardNote ?? coachInput.originalCarryForwardNote ?? group.carryForwardNote ?? "").trim(),
    currentNote: String(prior?.currentNote ?? coachInput.currentNote ?? ""),
    disposition: ["accepted", "edited", "dismissed", "replaced"].includes(prior?.disposition)
      ? prior.disposition
      : (["accepted", "edited", "dismissed", "replaced"].includes(coachInput.disposition)
          ? coachInput.disposition
          : (group.carryForwardNote ? "accepted" : "replaced"))
  };
}

export function executableCardsForBlock(block = {}) {
  const entries = [];
  (Array.isArray(block.cards) ? block.cards : []).forEach(card => {
    const groupIds = Array.isArray(card.groupIds) ? card.groupIds.map(String).filter(Boolean) : [];
    if (groupIds.length) groupIds.forEach(groupId => entries.push({ ...card, groupId,
      athleteIds: Array.isArray(card.athleteIds) ? card.athleteIds.map(String) : [] }));
    else entries.push({ ...card, groupId: String(card.groupId || ""),
      athleteIds: Array.isArray(card.athleteIds) ? card.athleteIds.map(String) : [] });
  });
  (Array.isArray(block.groupActivities) ? block.groupActivities : [])
    .filter(activity => activity?.status === "ready")
    .forEach(activity => (activity.cards || []).forEach(card => entries.push({
      ...card,
      groupId: String(activity.groupId || ""),
      athleteIds: Array.isArray(activity.athleteIds) ? activity.athleteIds.map(String) : []
    })));
  const unique = new Map();
  entries.forEach(card => {
    const identity = String(card.id || card.cardId || card.href || card.skill || card.family || card.title || "");
    if (identity) unique.set(`${identity}::${card.groupId || ""}`, card);
  });
  return [...unique.values()];
}
