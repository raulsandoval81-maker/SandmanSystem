export const F8_REMOTE_ACCESS_GATEWAY = Object.freeze({
  progressionTier: "T1",
  stripeCount: 1,
} as const);

function tierIndex(value: unknown): number | null {
  const match = String(value ?? "").trim().toUpperCase().match(/^T([0-4])$/);
  return match ? Number(match[1]) : null;
}

export function hasReachedF8RemoteAccessGateway(
  progressionTier: unknown,
  stripeCount: unknown
): boolean {
  const tier = tierIndex(progressionTier);
  if (tier === null) return false;
  return tier > 1 || (tier === 1 && Number(stripeCount ?? 0) >= 1);
}

export function resolveF8RemoteAccess(athlete: any): {
  strength: boolean;
  honor: boolean;
  gatewayReached: boolean;
} {
  const gatewayReached = hasReachedF8RemoteAccessGateway(
    athlete?.progressionTier ?? athlete?.tier,
    athlete?.stripeCount ?? athlete?.stripesEarned
  );
  return Object.freeze({
    strength: athlete?.unlocks?.strength === true || gatewayReached,
    honor: athlete?.unlocks?.honor === true || gatewayReached,
    gatewayReached,
  });
}
