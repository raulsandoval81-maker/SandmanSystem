import { createHash } from "node:crypto";
import { summarizeHistoricalCash } from "../billing/historicalCashReconciliation";

/**
 * Standalone Management adjustment policy. Existing receipts are source records,
 * never created here. This first supported action reallocates ONE existing
 * receipt between a historical membership month and enrollment fee.
 */
const clean = (x: unknown) => String(x ?? "").trim();
function cents(x: unknown, label: string): number {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 0) {
    throw new Error(`${label} must be nonnegative whole cents.`);
  }
  return Number(x);
}
function onePeriod(payment: Record<string, any>): string {
  const requested = Array.isArray(payment.requestedPeriods) ? payment.requestedPeriods : [];
  const allocated = Array.isArray(payment.membershipPeriodAllocations)
    ? payment.membershipPeriodAllocations.map((a: any) => a.period) : [];
  const paid = Array.isArray(payment.periods) ? payment.periods : [];
  const found = [...new Set([...requested, ...allocated, ...paid])];
  if (found.length !== 1 || !/^\\d{4}-(0[1-9]|1[0-2])$/.test(found[0])) {
    throw new Error("This receipt uses multiple or unknown months. Leave it unchanged and send for review.");
  }
  return found[0];
}
function fingerprint(proposal: Record<string, any>): string {
  // Serializes all fields affecting reconciliation, including receipt IDs,
  // cash-disposition state and agreement terms. No client-supplied financial
  // state is ever trusted.
  return createHash("sha256").update(JSON.stringify({
    status: proposal.status,
    locationId: proposal.locationId,
    pricing: proposal.pricing,
    priorPayments: proposal.priorPayments,
    historicalCashDisposition: proposal.historicalCashDisposition,
    clientReview: proposal.clientReview,
    clientAcceptance: proposal.clientAcceptance,
    lockedSnapshot: proposal.lockedSnapshot,
    pendingCheckoutSessionId: proposal.pendingCheckoutSessionId,
    stripeCheckoutSessionId: proposal.stripeCheckoutSessionId,
    stripeSubscriptionId: proposal.stripeSubscriptionId,
    cashPrepayment: proposal.cashPrepayment,
  })).digest("hex");
}
export function buildManualProposalAdjustment(
  proposal: Record<string, any>,
  entries: Array<Record<string, unknown>>
) {
  if (clean(proposal.status).toUpperCase() !== "DRAFT" ||
      proposal.clientReview?.tokenHash || proposal.clientAcceptance ||
      proposal.lockedSnapshot || proposal.pendingCheckoutSessionId ||
      proposal.stripeCheckoutSessionId || proposal.stripeSubscriptionId ||
      proposal.stripePaymentIntentId || proposal.cashPrepayment ||
      proposal.historicalCashDisposition?.status === "recorded") {
    throw new Error("Only an unsigned, uncharged Draft without a recorded cash disposition can be adjusted here.");
  }
  const originals = proposal.priorPayments;
  if (!Array.isArray(originals) || !originals.length || originals.length > 24) {
    throw new Error("A proposal with 1–24 existing historical receipts is required.");
  }
  if (!Array.isArray(entries) || !entries.length || entries.length > 24) {
    throw new Error("Select at least one existing receipt.");
  }
  const monthly = Math.round(Number(proposal.pricing?.monthlyBalance) * 100);
  const fee = Math.round(Number(proposal.pricing?.enrollmentBase) * 100);
  if (!Number.isSafeInteger(monthly) || monthly <= 0 ||
      !Number.isSafeInteger(fee) || fee < 0) {
    throw new Error("Proposal pricing is invalid.");
  }
  const byId = new Map<string, Record<string, any>>();
  for (const p of originals) {
    const id = clean(p?.paymentId);
    if (!id || byId.has(id)) throw new Error("Existing receipts need unique payment references.");
    byId.set(id, p);
  }
  const seen = new Set<string>();
  const amendments = new Map<string, Record<string, unknown>>();
  for (const item of entries) {
    const id = clean(item.paymentId);
    if (!id || !byId.has(id) || seen.has(id)) {
      throw new Error("Each adjustment must identify a different existing receipt.");
    }
    seen.add(id);
    amendments.set(id, item);
  }
  const after = originals.map((p: Record<string, any>) => {
    const item = amendments.get(clean(p.paymentId));
    if (!item) return p;
    const amount = cents(p.amountCents, "Original receipt");
    const enrollment = cents(item.enrollmentFeeAmountCents, "Enrollment allocation");
    const rate = cents(item.historicalMonthlyRateCents, "Historical monthly rate");
    const period = onePeriod(p);
    if (rate <= 0 || enrollment > amount) throw new Error("Invalid enrollment split or historical rate.");
    const membership = amount - enrollment;
    if (membership > rate) {
      throw new Error("Membership allocation exceeds that month's agreed rate.");
    }
    // No unallocated funds are created by this type of adjustment. A credit,
    // refund or surplus must use the separately authorized disposition route.
    return {
      ...p,
      membershipAmountCents: membership,
      enrollmentFeeAmountCents: enrollment,
      enrollmentFeeIncluded: false,
      unappliedMembershipAmountCents: 0,
      requestedPeriods: [period],
      periods: membership === rate ? [period] : [],
      membershipPeriodAllocations: [{
        period, paidCents: membership, previouslyPaidCents: 0,
        totalPaidCents: membership, requiredCents: rate,
        fullyPaid: membership === rate,
      }],
      historicalMonthlyRateCents: rate,
    };
  });
  const before = summarizeHistoricalCash({
    priorPayments: originals, monthlyMembershipCents: monthly, enrollmentFeeCents: fee,
  });
  const result = summarizeHistoricalCash({
    priorPayments: after, monthlyMembershipCents: monthly, enrollmentFeeCents: fee,
  });
  if (result.issues.length) throw new Error(result.issues.join(" "));
  const receiptTotal = originals.reduce((n: number, p: any) => n + cents(p.amountCents, "Original receipt"), 0);
  if (result.totalRecordedCents !== receiptTotal) {
    throw new Error("Adjustment cannot change collected cash.");
  }
  if (JSON.stringify(after) === JSON.stringify(originals)) {
    throw new Error("No allocation changed.");
  }
  return {
    fingerprint: fingerprint(proposal),
    originalTotalCents: receiptTotal,
    before, afterSummary: result, beforePayments: originals, afterPayments: after,
    affectsSignedAgreement: false,
    checkoutAuthorized: false,
  };
}
export { fingerprint as manualAdjustmentFingerprint, onePeriod as manualAdjustmentReceiptPeriod };
