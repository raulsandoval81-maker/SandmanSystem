export const MAX_TRAINING_GROUPS = 3;

const VALID_TIER = /^T[0-4]$/;

export function normalizeVerifiedTier(value = "") {
  const tier = String(value || "").trim().toUpperCase();
  return VALID_TIER.test(tier) ? tier : "";
}

export function summarizeRosterTiers(roster = []) {
  const entries = Array.isArray(roster) ? roster : [];
  const tiers = entries.map((athlete) => normalizeVerifiedTier(athlete?.tier));
  const verifiedTiers = [...new Set(tiers.filter(Boolean))].sort();
  const hasUnknownTier = tiers.some((tier) => !tier);
  const mixed = verifiedTiers.length > 1;
  const verified = entries.length > 0 && !mixed && !hasUnknownTier && verifiedTiers.length === 1;

  return {
    status: mixed ? "mixed" : verified ? "verified" : "unverified",
    commonTier: verified ? verifiedTiers[0] : "",
    verifiedTiers,
    hasUnknownTier,
    label: mixed ? "Mixed Tiers" : verified ? verifiedTiers[0] : "Tier Unverified"
  };
}

export function normalizeTrainingGroup(group = {}) {
  const roster = (Array.isArray(group.roster) ? group.roster : []).map((athlete) => ({
    athleteId: String(athlete?.athleteId || athlete?.id || ""),
    athleteName: String(athlete?.athleteName || athlete?.name || athlete?.athleteId || athlete?.id || ""),
    tier: normalizeVerifiedTier(athlete?.tier)
  })).filter((athlete) => athlete.athleteId);
  const summary = summarizeRosterTiers(roster);
  const requestedFocus = normalizeVerifiedTier(group.instructionalTier || group.tier);
  const instructionalFocusConfirmed = summary.status === "verified"
    ? true
    : group.instructionalFocusConfirmed === true && Boolean(requestedFocus);
  const instructionalTier = summary.status === "verified"
    ? summary.commonTier
    : instructionalFocusConfirmed ? requestedFocus : "";

  return {
    ...group,
    roster,
    athleteIds: roster.map((athlete) => athlete.athleteId),
    athleteNames: roster.map((athlete) => athlete.athleteName),
    athleteTiers: Object.fromEntries(roster.map((athlete) => [athlete.athleteId, athlete.tier])),
    tierStatus: summary.status,
    progressionTier: summary.commonTier,
    progressionTierLabel: summary.label,
    verifiedTiers: summary.verifiedTiers,
    hasUnknownTier: summary.hasUnknownTier,
    instructionalTier,
    instructionalFocusConfirmed,
    // `tier` remains the curriculum-focus compatibility field consumed by
    // Session Builder. It is deliberately blank until a mixed/unverified
    // group receives explicit Coach confirmation.
    tier: instructionalTier
  };
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
  if (!athlete) return normalized;

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

export function validateTrainingGroupRoster(groups = [], expectedAthleteIds = []) {
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

  return {
    ok: normalized.length > 0 && normalized.length <= MAX_TRAINING_GROUPS
      && !duplicateIds.length && !missingIds.length && !unexpectedIds.length
      && !unresolvedFocusGroupIds.length,
    duplicateIds,
    missingIds,
    unexpectedIds,
    unresolvedFocusGroupIds,
    groupCount: normalized.length
  };
}
