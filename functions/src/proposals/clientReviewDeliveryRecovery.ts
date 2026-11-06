// Pure policy used inside the Firestore issuance transaction.
// An unresolved provider call is not proof that the email failed.
export function clientReviewRecoveryGate(input: {
  deliveryStatus: string;
  issuedAtMs: number | null;
  recoveryExpectedIssuedAtMs: number | null;
  hasRecovery: boolean;
  nowMs: number;
}): { allowed: boolean; reason?: string; unresolved: boolean } {
  const unresolved = input.deliveryStatus === "unknown" ||
    input.deliveryStatus === "sending";
  if (!unresolved) {
    return input.hasRecovery
      ? { allowed: false, unresolved, reason: "Delivery state changed. Refresh before reissuing." }
      : { allowed: true, unresolved };
  }
  if (!input.hasRecovery || !Number.isSafeInteger(input.issuedAtMs) ||
      input.issuedAtMs! <= 0 ||
      input.recoveryExpectedIssuedAtMs !== input.issuedAtMs) {
    return { allowed: false, unresolved,
      reason: "Reconcile the prior provider outcome before revoking its link." };
  }
  if (input.deliveryStatus === "sending" &&
      input.nowMs - input.issuedAtMs! < 10 * 60 * 1000) {
    return { allowed: false, unresolved,
      reason: "Delivery may still be processing; wait until the ten-minute recovery gate has elapsed." };
  }
  return { allowed: true, unresolved };
}
