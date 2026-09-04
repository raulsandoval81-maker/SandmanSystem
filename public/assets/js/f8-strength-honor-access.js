export function hasReachedF8RemoteAccessGateway(athlete = {}) {
  const rawTier = athlete.progressionTier ?? athlete.tier;
  const match = String(rawTier ?? "").trim().toUpperCase().match(/^T([0-4])$/);
  if (!match) return false;
  const tier = Number(match[1]);
  const stripes = Number(athlete.stripeCount ?? athlete.stripesEarned ?? 0);
  return tier > 1 || (tier === 1 && stripes >= 1);
}

export function resolveF8RemoteAccess(athlete = {}) {
  const gatewayReached = hasReachedF8RemoteAccessGateway(athlete);
  const match = String(athlete.progressionTier ?? athlete.tier ?? "").trim().toUpperCase().match(/^T([0-4])$/);
  const athleteAssignmentsAllowed = !!match && Number(match[1]) > 0;
  return {
    strength: athleteAssignmentsAllowed && (athlete?.unlocks?.strength === true || gatewayReached),
    honor: athleteAssignmentsAllowed && (athlete?.unlocks?.honor === true || gatewayReached),
    gatewayReached,
  };
}
