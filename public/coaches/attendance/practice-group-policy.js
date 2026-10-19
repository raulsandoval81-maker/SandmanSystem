export const MAX_TRAINING_GROUPS = 3;

const VALID_TIER = /^T[0-4]$/;

function normalizeCompatibilityValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeCompatibilityJourney(value = "") {
  const key = normalizeCompatibilityValue(value).replace(/[\s_-]+/g, "");
  if (["z2h", "zero2hero", "road2champion"].includes(key)) return "z2h";
  if (["p2l", "path2legend"].includes(key)) return "p2l";
  if (["q2m", "quest2mastery"].includes(key)) return "q2m";
  return key;
}

function normalizeCompatibilityDiscipline(value = "") {
  const key = normalizeCompatibilityValue(value).replace(/[\s_]+/g, "-");
  return ["kickboxing", "muaythai", "muay-thai"].includes(key) ? "muay-thai" : key;
}

export function trainingCompatibilityKey(value = {}) {
  return [
    normalizeCompatibilityJourney(value.journey),
    normalizeCompatibilityDiscipline(value.discipline),
    normalizeCompatibilityValue(value.ageGroup),
    normalizeCompatibilityValue(value.locationId),
    normalizeCompatibilityValue(value.practiceId)
  ].join("|");
}

export function normalizeDisplayedTier(value = "") {
  const tier = String(value || "").trim().toUpperCase();
  return VALID_TIER.test(tier) ? tier : "";
}

export function summarizeRosterTiers(roster = []) {
  const entries = Array.isArray(roster) ? roster : [];
  const tiers = entries.map((athlete) => normalizeDisplayedTier(athlete?.tier));
  const displayedTiers = [...new Set(tiers.filter(Boolean))].sort();
  const hasUnknownTier = tiers.some((tier) => !tier);
  const mixed = displayedTiers.length > 1;
  const uniform = entries.length > 0 && !mixed && !hasUnknownTier && displayedTiers.length === 1;

  return {
    status: mixed ? "mixed" : uniform ? "uniform" : "unavailable",
    commonTier: uniform ? displayedTiers[0] : "",
    displayedTiers,
    hasUnknownTier,
    label: mixed ? "Mixed Tiers" : uniform ? displayedTiers[0] : "Tier Display Unavailable"
  };
}

function tierSortValue(tier = "") {
  const normalized = normalizeDisplayedTier(tier);
  return normalized ? Number(normalized.slice(1)) : 99;
}

function splitTierBuckets(buckets = [], count = 1) {
  const groups = [];
  const safeCount = Math.max(1, Math.min(count, buckets.length));
  let offset = 0;
  for (let index = 0; index < safeCount; index += 1) {
    const remainingBuckets = buckets.length - offset;
    const remainingGroups = safeCount - index;
    const take = Math.ceil(remainingBuckets / remainingGroups);
    groups.push(buckets.slice(offset, offset + take).flatMap((bucket) => bucket.roster));
    offset += take;
  }
  return groups;
}

export function suggestTierAwareTrainingGroups(roster = [], options = {}) {
  const athletes = (Array.isArray(roster) ? roster : [])
    .map((athlete) => ({ ...athlete, tier: normalizeDisplayedTier(athlete?.tier) }))
    .filter((athlete) => athlete.athleteId || athlete.id);
  const maxGroups = Math.max(1, Math.min(MAX_TRAINING_GROUPS, Number(options.maxGroups) || MAX_TRAINING_GROUPS));
  const partitions = new Map();

  athletes.forEach((athlete) => {
    const key = trainingCompatibilityKey(athlete);
    if (!partitions.has(key)) partitions.set(key, { key, template: athlete, roster: [] });
    partitions.get(key).roster.push(athlete);
  });

  const orderedPartitions = [...partitions.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (orderedPartitions.length > maxGroups) {
    // The three-group operating limit cannot truthfully represent more than
    // three incompatible rosters. Keep every athlete visible and fail closed
    // for Coach resolution instead of dropping anyone.
    const retained = orderedPartitions.slice(0, maxGroups - 1);
    const overflow = orderedPartitions.slice(maxGroups - 1);
    orderedPartitions.splice(0, orderedPartitions.length, ...retained, {
      key: "overflow",
      template: overflow[0].template,
      roster: overflow.flatMap((partition) => partition.roster),
      incompatibleOverflow: true,
    });
  }

  const allocation = orderedPartitions.map(() => 1);
  let remaining = Math.max(0, maxGroups - orderedPartitions.length);
  while (remaining > 0) {
    const candidate = orderedPartitions
      .map((partition, index) => ({
        index,
        available: new Set(partition.roster.map((athlete) => athlete.tier || "unknown")).size - allocation[index],
        size: partition.roster.length,
        key: partition.key,
      }))
      .filter((entry) => entry.available > 0)
      .sort((a, b) => b.available - a.available || b.size - a.size || a.key.localeCompare(b.key))[0];
    if (!candidate) break;
    allocation[candidate.index] += 1;
    remaining -= 1;
  }

  const suggestions = orderedPartitions.flatMap((partition, partitionIndex) => {
    const tierBuckets = new Map();
    partition.roster.forEach((athlete) => {
      const key = athlete.tier || "unknown";
      if (!tierBuckets.has(key)) tierBuckets.set(key, { tier: key, roster: [] });
      tierBuckets.get(key).roster.push(athlete);
    });
    const buckets = [...tierBuckets.values()].sort((a, b) => tierSortValue(a.tier) - tierSortValue(b.tier));
    return splitTierBuckets(buckets, allocation[partitionIndex]).map((groupRoster) => {
      const summary = summarizeRosterTiers(groupRoster);
      const suggestedInstructionalTier = summary.commonTier || summary.displayedTiers[0] || "";
      return normalizeTrainingGroup({
        journey: partition.template.journey,
        discipline: partition.template.discipline,
        ageGroup: partition.template.ageGroup,
        locationId: partition.template.locationId,
        practiceId: partition.template.practiceId,
        roster: groupRoster,
        suggestedInstructionalTier,
        groupingBasis: "tier-display-fallback",
        instructionalRecommendation: summary.status === "uniform"
          ? `Provisional ${summary.commonTier} tier-display starting point — Coach confirmation required`
          : suggestedInstructionalTier
            ? `Provisional fallback: review ${suggestedInstructionalTier} foundations and differentiate by athlete evidence`
            : "Provisional fallback unavailable: Coach must select an instructional focus",
        incompatibleOverflow: partition.incompatibleOverflow === true,
      });
    });
  });

  return suggestions.map((group, index) => ({ ...group, id: `group-${index + 1}` }));
}

export function normalizeTrainingGroup(group = {}) {
  const roster = (Array.isArray(group.roster) ? group.roster : []).map((athlete) => ({
    athleteId: String(athlete?.athleteId || athlete?.id || ""),
    athleteName: String(athlete?.athleteName || athlete?.name || athlete?.athleteId || athlete?.id || ""),
    tier: normalizeDisplayedTier(athlete?.tier),
    tierProvenance: String(athlete?.tierProvenance || athlete?.syntheticPlacementSource || ""),
    syntheticPlacement: athlete?.syntheticPlacement === true,
    syntheticPlacementCertified: athlete?.syntheticPlacementCertified === true,
    syntheticPlacementSource: String(athlete?.syntheticPlacementSource || ""),
    journey: String(athlete?.journey || group.journey || ""),
    discipline: String(athlete?.discipline || group.discipline || ""),
    ageGroup: String(athlete?.ageGroup || group.ageGroup || ""),
    locationId: String(athlete?.locationId || group.locationId || ""),
    practiceId: String(athlete?.practiceId || group.practiceId || "")
  })).filter((athlete) => athlete.athleteId);
  const summary = summarizeRosterTiers(roster);
  const requestedFocus = normalizeDisplayedTier(group.instructionalTier || group.tier);
  const instructionalFocusConfirmed = group.instructionalFocusConfirmed === true && Boolean(requestedFocus);
  const instructionalTier = instructionalFocusConfirmed ? requestedFocus : "";

  return {
    ...group,
    roster,
    athleteIds: roster.map((athlete) => athlete.athleteId),
    athleteNames: roster.map((athlete) => athlete.athleteName),
    athleteTiers: Object.fromEntries(roster.map((athlete) => [athlete.athleteId, athlete.tier])),
    tierStatus: summary.status,
    progressionTier: summary.commonTier,
    progressionTierLabel: summary.label,
    displayedTiers: summary.displayedTiers,
    hasUnknownTier: summary.hasUnknownTier,
    instructionalTier,
    instructionalFocusConfirmed,
    // `tier` remains the curriculum-focus compatibility field consumed by
    // Session Builder. It remains blank until the Coach confirms that the
    // displayed tier is appropriate for this practice's instruction.
    tier: instructionalTier
  };
}

export function tierWaveEligibility(group = {}) {
  const normalized = normalizeTrainingGroup(group);
  const rosterJourneys = [...new Set(normalized.roster
    .map((athlete) => normalizeCompatibilityJourney(athlete.journey))
    .filter(Boolean))];
  const groupJourney = normalizeCompatibilityJourney(normalized.journey);

  if (!normalized.roster.length) {
    return { eligible: false, reason: "empty_group", message: "Add an athlete before selecting a Tier Wave." };
  }
  if (rosterJourneys.length > 1) {
    return { eligible: false, reason: "mixed_journeys", message: "Mixed Journeys do not share Tier Waves. Use Coach-directed planning or separate Journey-specific groups." };
  }
  if (!groupJourney || (rosterJourneys[0] && rosterJourneys[0] !== groupJourney)) {
    return { eligible: false, reason: "journey_mismatch", message: "The group Journey does not match the athlete roster. Tier Waves remain unavailable." };
  }
  if (!normalized.instructionalTier || !normalized.instructionalFocusConfirmed) {
    return { eligible: false, reason: "focus_unconfirmed", message: "Confirm the instructional focus and pacing before selecting a Tier Wave." };
  }

  return {
    eligible: true,
    reason: normalized.tierStatus === "uniform" ? "same_tier_confirmed" : "mixed_tiers_confirmed",
    journey: groupJourney,
    tier: normalized.instructionalTier,
    coachConfirmationRequired: true
  };
}

export function restoreCoachGroupOverrides(suggestedGroups = [], priorGroups = []) {
  const suggested = (Array.isArray(suggestedGroups) ? suggestedGroups : []).map(normalizeTrainingGroup);
  const prior = (Array.isArray(priorGroups) ? priorGroups : []).slice(0, MAX_TRAINING_GROUPS);
  if (!prior.length) return suggested;

  const currentAthletes = new Map(suggested.flatMap((group) => group.roster.map((athlete) => [athlete.athleteId, athlete])));
  const restored = prior.map((group) => normalizeTrainingGroup({
    ...group,
    roster: (Array.isArray(group.athleteIds) ? group.athleteIds : [])
      .map((id) => currentAthletes.get(String(id))).filter(Boolean),
  }));
  const assigned = new Set(restored.flatMap((group) => group.athleteIds));

  for (const suggestion of suggested) {
    for (const athlete of suggestion.roster) {
      if (assigned.has(athlete.athleteId)) continue;
      const compatible = restored.find((group) => athleteCanJoinTrainingGroup(athlete, group));
      if (compatible) compatible.roster.push(athlete);
      else if (restored.length < MAX_TRAINING_GROUPS) restored.push(normalizeTrainingGroup({ ...suggestion, roster: [athlete] }));
      else return suggested;
      assigned.add(athlete.athleteId);
    }
  }

  const normalized = restored.filter((group) => group.roster.length).map(normalizeTrainingGroup);
  const check = validateTrainingGroupRoster(normalized, [...currentAthletes.keys()], { requireFocus: false });
  return check.ok ? normalized.map((group, index) => ({ ...group, id: `group-${index + 1}` })) : suggested;
}

export function athleteCanJoinTrainingGroup(athlete = {}, group = {}) {
  return Boolean(athlete?.athleteId || athlete?.id)
    && trainingCompatibilityKey(athlete) === trainingCompatibilityKey(group);
}

export function moveAthleteBetweenGroups(groups = [], athleteId = "", targetGroupId = "") {
  const id = String(athleteId || "");
  const target = String(targetGroupId || "");
  const normalized = (Array.isArray(groups) ? groups : []).map(normalizeTrainingGroup);
  if (!id || !normalized.some((group) => String(group.id) === target)) return normalized;

  let athlete = null;
  let sourceGroupId = "";
  const withoutAthlete = normalized.map((group) => ({
    ...group,
    roster: group.roster.filter((entry) => {
      if (entry.athleteId !== id) return true;
      athlete ||= entry;
      sourceGroupId ||= String(group.id || "");
      return false;
    })
  }));
  const targetGroup = normalized.find((group) => String(group.id) === target);
  if (!athlete || !targetGroup || !athleteCanJoinTrainingGroup(athlete, targetGroup)) return normalized;

  return withoutAthlete.map((group) => {
    const membershipChanged = [sourceGroupId, target].includes(String(group.id || ""));
    return normalizeTrainingGroup({
      ...group,
      roster: String(group.id) === target ? [...group.roster, athlete] : group.roster,
      instructionalFocusConfirmed: membershipChanged ? false : group.instructionalFocusConfirmed,
      instructionalTier: membershipChanged ? "" : group.instructionalTier,
      tier: membershipChanged ? "" : group.tier
    });
  });
}

export function validateTrainingGroupRoster(groups = [], expectedAthleteIds = [], options = {}) {
  const normalized = (Array.isArray(groups) ? groups : []).map(normalizeTrainingGroup);
  const expected = [...new Set((Array.isArray(expectedAthleteIds) ? expectedAthleteIds : []).map(String).filter(Boolean))];
  const assigned = normalized.flatMap((group) => group.athleteIds);
  const unique = new Set(assigned);
  const expectedSet = new Set(expected);
  const duplicateIds = [...new Set(assigned.filter((id, index) => assigned.indexOf(id) !== index))];
  const missingIds = expected.filter((id) => !unique.has(id));
  const unexpectedIds = [...unique].filter((id) => !expectedSet.has(id));
  const unresolvedFocusGroupIds = normalized
    .filter((group) => group.athleteIds.length && !group.instructionalTier)
    .map((group) => String(group.id || ""));
  const incompatibleAssignments = normalized.flatMap((group) => group.roster
    .filter((athlete) => !athleteCanJoinTrainingGroup(athlete, group))
    .map((athlete) => ({ athleteId: athlete.athleteId, groupId: String(group.id || "") })));

  return {
    ok: normalized.length > 0 && normalized.length <= MAX_TRAINING_GROUPS
      && !duplicateIds.length && !missingIds.length && !unexpectedIds.length
      && (options.requireFocus === false || !unresolvedFocusGroupIds.length) && !incompatibleAssignments.length,
    duplicateIds,
    missingIds,
    unexpectedIds,
    unresolvedFocusGroupIds,
    incompatibleAssignments,
    groupCount: normalized.length
  };
}
