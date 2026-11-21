/**
 * The earned-stripe floor is a non-regression safety boundary, not a new decay schedule.
 * Fail closed when rank / stripe evidence is incomplete. Recognition history is never
 * changed by inactivity decay, and previous promoted tiers remain untouched.
 */
export function resolveEarnedStripeFloor(args: {
  athlete: any;
  tier: string;
  xpCap: number;
}): number {
  const { athlete, tier, xpCap } = args;
  const tierMatch = /^T([0-4])$/i.exec(String(tier || ""));
  if (!tierMatch || !Number.isSafeInteger(xpCap) || xpCap <= 0) {
    throw new Error("DECAY_STRIPE_AUTHORITY_UNVERIFIED");
  }
  const currentTier = Number(tierMatch[1]);
  const candidates: number[] = [];
  for (const field of ["stripeCount", "stripesEarned", "stripe"]) {
    const value = athlete?.[field];
    if (value === undefined || value === null) continue;
    if (!Number.isInteger(value) || value < 0 || value > 4) {
      throw new Error("DECAY_STRIPE_AUTHORITY_UNVERIFIED");
    }
    candidates.push(value);
  }
  const history = athlete?.recognitionHistory;
  if (history !== undefined && !Array.isArray(history)) {
    throw new Error("DECAY_STRIPE_AUTHORITY_UNVERIFIED");
  }
  for (const entry of Array.isArray(history) ? history : []) {
    if (entry?.type !== "STRIPE_AWARD") continue;
    if (!Number.isInteger(entry.tier) || entry.tier < 0 || entry.tier > 4 ||
      !Number.isInteger(entry.stripe) || entry.stripe < 1 || entry.stripe > 4) {
      throw new Error("DECAY_STRIPE_AUTHORITY_UNVERIFIED");
    }
    if (entry.tier === currentTier) candidates.push(entry.stripe);
  }
  // A missing stripe record cannot be interpreted as no earned stripes.
  if (!candidates.length) throw new Error("DECAY_STRIPE_AUTHORITY_UNVERIFIED");
  return Math.ceil((xpCap * Math.max(...candidates)) / 4);
}

export function applyProtectedDecay(args: {
  athlete: any;
  tier: string;
  xpCap: number;
  beforeXp: number;
  deduction: number;
}): { beforeXp: number; afterXp: number; floorXp: number } {
  const { beforeXp, deduction } = args;
  if (!Number.isFinite(beforeXp) || beforeXp < 0 ||
    !Number.isSafeInteger(deduction) || deduction < 0) {
    throw new Error("INVALID_ACTIVE_XP");
  }
  const floorXp = resolveEarnedStripeFloor(args);
  if (beforeXp < floorXp) {
    // Never overwrite a preexisting inconsistency with a decay transaction.
    throw new Error("DECAY_EARNED_STRIPE_BALANCE_INCONSISTENT");
  }
  return { beforeXp, afterXp: Math.max(floorXp, beforeXp - deduction), floorXp };
}
