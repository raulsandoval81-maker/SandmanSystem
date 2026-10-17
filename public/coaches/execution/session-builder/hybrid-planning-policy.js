export const HYBRID_PLANNING_SOURCES = Object.freeze(["tierWaves", "systemSuggestions", "coachInput"]);

export const DEFAULT_HYBRID_PLANNING_SOURCES = Object.freeze({
  tierWaves: true,
  systemSuggestions: true,
  coachInput: true
});

export function normalizePlanningSources(value = {}, mode = "hybrid") {
  if (mode !== "hybrid") return Object.fromEntries(HYBRID_PLANNING_SOURCES.map(key => [key, false]));
  return Object.fromEntries(HYBRID_PLANNING_SOURCES.map(key => [key, value[key] !== false]));
}

export function enabledPlanningSources(value = {}, mode = "hybrid") {
  const normalized = normalizePlanningSources(value, mode);
  return HYBRID_PLANNING_SOURCES.filter(key => normalized[key]);
}

export function composeGroupPlanning({ group = {}, sources = {}, wave = null, prior = {} } = {}) {
  const enabled = normalizePlanningSources(sources, "hybrid");
  const acceptedWave = enabled.tierWaves && wave?.waveKey ? {
    waveKey: String(wave.waveKey),
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
