import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "../proposals/proposalAccess";
import { enrollmentFeePaidCents } from "./priorPaymentAllocation";
import {
  resolveFullYearPrepayment,
  validateFullYearCoverage,
} from "./prepaidMembershipPolicy";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function toPositiveInteger(
  value: unknown,
  fieldName: string
): number {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a positive whole number.`
    );
  }

  return parsed;
}

function normalizePaymentMethod(value: unknown): "cash" | "check" {
  const method = cleanString(value).toLowerCase();
  if (method !== "cash" && method !== "check") {
    throw new HttpsError("invalid-argument", "paymentMethod must be cash or check.");
  }
  return method;
}

function parseLocalDate(value: unknown): Timestamp {
  const raw = cleanString(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpsError(
      "invalid-argument",
      "nextBillingDate must use YYYY-MM-DD."
    );
  }

  const parsed = new Date(`${raw}T12:00:00-07:00`);

  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError(
      "invalid-argument",
      "nextBillingDate is invalid."
    );
  }

  return Timestamp.fromDate(parsed);
}

export const recordProposalPrepaidCash =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to record a cash payment."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const proposalId =
      cleanString(req.data?.proposalId);

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    const amountCents =
      toPositiveInteger(
        req.data?.amountCents,
        "amountCents"
      );

    const membershipAmountCents =
      toPositiveInteger(req.data?.membershipAmountCents, "membershipAmountCents");
    const paymentMethod = normalizePaymentMethod(req.data?.paymentMethod);
    const paymentDateRaw = cleanString(req.data?.paymentDate);
    const membershipStartDateRaw = cleanString(req.data?.membershipStartDate);
    const membershipPaidThroughDateRaw = cleanString(req.data?.membershipPaidThroughDate);
    const nextBillingDateRaw = cleanString(req.data?.nextBillingDate);

    try {
      validateFullYearCoverage(
        membershipStartDateRaw,
        membershipPaidThroughDateRaw,
        nextBillingDateRaw
      );
    } catch (error) {
      throw new HttpsError(
        "invalid-argument",
        error instanceof Error ? error.message : "Invalid prepaid coverage dates."
      );
    }

    const paymentDate = parseLocalDate(paymentDateRaw);
    const membershipStartDate = parseLocalDate(membershipStartDateRaw);
    const membershipPaidThroughDate = parseLocalDate(membershipPaidThroughDateRaw);

    const nextBillingDate =
      parseLocalDate(
        nextBillingDateRaw
      );

    const note =
      cleanString(req.data?.note) ||
      null;

    const db =
      getFirestore();

    const proposalRef =
      db
        .collection("proposals")
        .doc(proposalId);

    try {
      const result =
        await db.runTransaction(
          async (tx) => {
            const proposalSnap =
              await tx.get(proposalRef);

            if (!proposalSnap.exists) {
              throw new HttpsError(
                "not-found",
                `Proposal ${proposalId} was not found.`
              );
            }

            const proposal =
              proposalSnap.data() || {};

            requireProposalLocationAccess(
              staffAccess,
              proposal.locationId
            );

            const currentStatus =
              cleanString(
                proposal.status
              ).toUpperCase();

            const hasStripePayment =
              [
                proposal.stripePaymentIntentId,
                proposal.stripeCheckoutSessionId,
                proposal.pendingCheckoutSessionId,
                proposal.stripeSubscriptionId,
              ].some(
                (value) =>
                  Boolean(
                    cleanString(value)
                  )
              );

            const isCheckoutReady =
              currentStatus ===
              "READY_FOR_CHECKOUT";

            const isLegacyPaidWithoutStripe =
              currentStatus === "PAID" &&
              !hasStripePayment;

            if (
              !isCheckoutReady &&
              !isLegacyPaidWithoutStripe
            ) {
              throw new HttpsError(
                "failed-precondition",
                currentStatus === "PAID"
                  ? "This proposal already has Stripe payment activity and cannot be changed to prepaid cash."
                  : "Prepaid cash may only be recorded before Stripe checkout begins or on a paid proposal with no Stripe payment attached."
              );
            }

            if (proposal.cashPrepayment) {
              throw new HttpsError(
                "already-exists",
                "Prepaid cash has already been recorded for this proposal."
              );
            }

            const pricing = proposal.pricing || {};
            const monthlyMembershipCents = Math.round(
              Number(pricing.monthlyBalance || 0) * 100
            );
            const enrollmentFeeTotalCents = Math.round(
              Number(pricing.enrollmentBase || 0) * 100
            );
            const priorPayments = Array.isArray(proposal.priorPayments)
              ? proposal.priorPayments
              : [];
            const priorPaymentEnrollmentCents = Math.min(
              enrollmentFeeTotalCents,
              priorPayments.reduce(
                (total: number, payment: Record<string, unknown>) =>
                  total + enrollmentFeePaidCents(payment, enrollmentFeeTotalCents),
                0
              )
            );
            const pricingEnrollmentCents = Math.round(
              Number(pricing.enrollmentPreviouslyPaidAmount || 0) * 100
            );
            let allocation;
            try {
              allocation = resolveFullYearPrepayment({
                amountCents,
                membershipAmountCents,
                expectedMonthlyMembershipCents: monthlyMembershipCents,
                enrollmentFeeTotalCents,
                enrollmentFeePreviouslyPaidCents: Math.max(
                  priorPaymentEnrollmentCents,
                  pricingEnrollmentCents
                ),
                athletes: Array.isArray(proposal.athletes) ? proposal.athletes : [],
                enrollmentFeeIncludedAthleteIndexes:
                  req.data?.enrollmentFeeIncludedAthleteIndexes,
                enrollmentFeeAllocations:
                  req.data?.enrollmentFeeAllocations,
              });
            } catch (error) {
              throw new HttpsError(
                "invalid-argument",
                error instanceof Error ? error.message : "Invalid paid-in-full allocation."
              );
            }

            const nextStatus =
              "PAID";

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            tx.update(
              proposalRef,
              {
                status:
                  nextStatus,

                billingFollowUpStatus:
                  "RENEWAL_AUTOPAY_APPROVAL_REQUIRED",

                paymentMethod:
                  "cash_prepaid",

                paymentStatus:
                  "paid",

                paidAt:
                  proposal.paidAt ||
                  FieldValue.serverTimestamp(),

                cashPrepayment: {
                  amountCents,
                  membershipAmountCents: allocation.membershipAmountCents,
                  membershipPaidInFull: allocation.membershipPaidInFull,
                  monthsCovered: 12,
                  paymentMethod,
                  paymentDate,
                  membershipStartDate,
                  membershipPaidThroughDate,
                  annualEnrollmentFee: allocation.annualEnrollmentFee,
                  nextBillingDate,
                  note,
                  receivedBy:
                    req.auth!.uid,
                  receivedByName:
                    staffAccess.fullName,
                  receivedAt:
                    FieldValue.serverTimestamp(),
                },

                nextBillingDate,
                membershipPaidThroughDate,

                updatedBy:
                  req.auth!.uid,

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  "CASH_PREPAYMENT_RECORDED",

                fromStatus:
                  currentStatus,

                toStatus:
                  nextStatus,

                amountCents,
                membershipAmountCents: allocation.membershipAmountCents,
                membershipPaidInFull: true,
                monthsCovered: 12,
                paymentMethod,
                paymentDate,
                membershipStartDate,
                membershipPaidThroughDate,
                annualEnrollmentFee: allocation.annualEnrollmentFee,
                nextBillingDate,
                note,

                createdBy:
                  req.auth!.uid,

                createdByName:
                  staffAccess.fullName,

                createdAt:
                  FieldValue.serverTimestamp(),
              }
            );

            return {
              proposalId,
              status:
                nextStatus,
              amountCents,
              membershipAmountCents: allocation.membershipAmountCents,
              membershipPaidInFull: true,
              monthsCovered: 12,
              paymentMethod,
              membershipPaidThroughDate,
              annualEnrollmentFee: allocation.annualEnrollmentFee,
            };
          }
        );

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      console.error(
        "[recordProposalPrepaidCash] Failed:",
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to record prepaid cash."
      );
    }
  });
