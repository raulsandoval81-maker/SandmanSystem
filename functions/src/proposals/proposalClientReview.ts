import {
  createHash,
  randomBytes,
} from "node:crypto";
import { summarizeHistoricalCash } from "../billing/historicalCashReconciliation";
import { validateHistoricalCashDisposition } from "../billing/historicalCashDisposition";
import { previewHistoricalCashPaymentPlan } from "../billing/historicalCashPaymentPlan";
import { resolveHistoricalCashCheckoutTerms } from "../billing/historicalCashCheckoutTerms";

export function cleanReviewString(
  value: unknown
): string {
  return String(value ?? "").trim();
}

export function createProposalReviewToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashProposalReviewToken(
  token: string
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

/**
 * Family-facing historical cash disclosure. Never implies permission to bill.
 * A Management disposition is a pending accounting instruction, not an executed
 * credit or refund. Refuse a client snapshot if the ledger is inconsistent.
 */
export function buildHistoricalCashClientDisclosure(proposal: Record<string, any>) {
  const payments = Array.isArray(proposal.priorPayments)
    ? proposal.priorPayments as Array<Record<string, unknown>>
    : [];
  if (!payments.length) return null;

  const pricing = proposal.pricing || {};
  const monthlyMembershipCents = Math.round(Number(pricing.monthlyBalance) * 100);
  const enrollmentFeeCents = Math.round(Number(pricing.enrollmentBase) * 100);
  const review = summarizeHistoricalCash({
    priorPayments: payments, monthlyMembershipCents, enrollmentFeeCents,
  });
  if (review.issues.length) {
    throw new Error("Historical cash ledger contains unresolved inconsistencies. Correct it before issuing a family review.");
  }
  const record = proposal.historicalCashDisposition;
  let disposition = null;
  if (review.unappliedMembershipCents > 0) {
    if (record?.status !== "recorded") {
      throw new Error("Management must record an explicit disposition for unapplied cash before issuing a family review.");
    }
    const validated = validateHistoricalCashDisposition({
      priorPayments: payments, monthlyMembershipCents, enrollmentFeeCents,
      kind: record.kind, amountCents: record.amountCents,
      targetPeriod: record.targetPeriod,
    });
    if (record.ledgerFingerprint !== validated.ledgerFingerprint) {
      throw new Error("Historical cash disposition does not match the current ledger.");
    }
    disposition = {
      kind: validated.kind,
      amountCents: validated.amountCents,
      targetPeriod: validated.targetPeriod,
      creditApplied: false,
      refundExecuted: false,
    };
  } else if (record?.status === "recorded") {
    throw new Error("Historical cash disposition is inconsistent with the current cash balance.");
  }
  const chargeDate = String(pricing.firstRecurringChargeDate || "").trim();
  const plan = previewHistoricalCashPaymentPlan({
    priorPayments: payments, monthlyMembershipCents, enrollmentFeeCents, chargeDate,
  });
  return {
    version: 1,
    recordedCashCents: review.totalRecordedCents,
    fullyPaidPeriods: review.fullyPaidPeriods,
    partiallyPaidPeriods: review.partiallyPaidPeriods,
    enrollmentPaidCents: review.enrollmentPaidCents,
    enrollmentRemainingCents: review.enrollmentRemainingCents,
    unappliedMembershipCents: review.unappliedMembershipCents,
    disposition,
    proposedFirstRecurringChargeDate: plan.chargeDate,
    proposedFirstRecurringPeriodPaidCents: plan.periodAlreadyPaidCents,
    proposedFirstRecurringPeriodOutstandingCents: plan.periodOutstandingCents,
    monthlyMembershipCents,
    checkoutAuthorized: false,
  };
}

export function buildClientProposalSnapshot(
  proposalId: string,
  proposal: Record<string, any>
) {
  const prospect =
    proposal.prospect || {};

  const coach =
    proposal.coach || {};
  const historicalCashCheckoutTerms = resolveHistoricalCashCheckoutTerms(proposal);
  const historicalCash = buildHistoricalCashClientDisclosure(proposal);
  const signedPricing = historicalCashCheckoutTerms
    ? {
        ...(proposal.pricing || {}),
        dueNow: historicalCashCheckoutTerms.dueNowCents / 100,
        enrollmentDueNow: historicalCashCheckoutTerms.enrollmentRemainingCents / 100,
        proratedFirstMonth: 0,
        prorationPercent: 0,
        additionalMembershipMonthsDue: 0,
        paymentStartMode: "deferred_family",
      }
    : proposal.pricing || {};

  return {
    version: 1,

    proposalId,

    prospect: {
      familyName:
        prospect.familyName || null,

      primaryContactName:
        prospect.primaryContactName || null,
    },

    preparedBy: {
      name:
        coach.name || null,
    },

    athletes:
      Array.isArray(proposal.athletes)
        ? proposal.athletes
        : [],

    pricing:
      signedPricing,

    historicalCash,
    historicalCashCheckoutTerms,

    agreement:
      proposal.agreement || {},
  };
}
