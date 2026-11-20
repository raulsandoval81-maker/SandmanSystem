/**
 * Pure policy for Management-requested operational decay.
 * No Firestore access and no authority to change earned stripe history.
 */
export function resolveStripeProtectedDecay(args: {
  currentXp: number;
  earnedStripeFloorXp: number;
  requestedDeduction: number;
}) {
  const { currentXp, earnedStripeFloorXp, requestedDeduction } = args;
  for (const value of [currentXp, earnedStripeFloorXp, requestedDeduction]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("INVALID_DECAY_AMOUNT");
    }
  }
  if (requestedDeduction === 0) throw new Error("DECAY_DEDUCTION_REQUIRED");
  if (earnedStripeFloorXp > currentXp) {
    throw new Error("EARNED_STRIPE_FLOOR_EXCEEDS_CURRENT_XP");
  }
  const afterXp = Math.max(earnedStripeFloorXp, currentXp - requestedDeduction);
  return Object.freeze({
    beforeXp: currentXp,
    afterXp,
    requestedDeduction,
    appliedDeduction: currentXp - afterXp,
    protectedFloorXp: earnedStripeFloorXp,
    floorReached: afterXp === earnedStripeFloorXp,
  });
}
