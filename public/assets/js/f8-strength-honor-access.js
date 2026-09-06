export const F8_SHADOW_ACTS_GATEWAY = Object.freeze({
  combat: 1,
  strength: 2,
  honor: 3,
});

export function resolveF8ShadowActs(athlete = {}) {
  const match = String(
    athlete.progressionTier ?? athlete.tier ?? ""
  ).trim().toUpperCase().match(/^T([0-4])$/);

  const tier = match ? Number(match[1]) : null;
  const stripes = Number(
    athlete.stripeCount ?? athlete.stripesEarned ?? 0
  );

  if (tier !== 0) {
    return {
      combat: false,
      strength: false,
      honor: false,
    };
  }

  return {
    combat: stripes >= F8_SHADOW_ACTS_GATEWAY.combat,
    strength: stripes >= F8_SHADOW_ACTS_GATEWAY.strength,
    honor: stripes >= F8_SHADOW_ACTS_GATEWAY.honor,
  };
}

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
    combat: athleteAssignmentsAllowed && gatewayReached,
    strength: athleteAssignmentsAllowed && (athlete?.unlocks?.strength === true || gatewayReached),
    honor: athleteAssignmentsAllowed && (athlete?.unlocks?.honor === true || gatewayReached),
    gatewayReached,
  };
}
