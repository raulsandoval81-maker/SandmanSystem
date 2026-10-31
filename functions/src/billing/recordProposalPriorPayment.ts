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
import {
  allocatePriorPayment,
  enrollmentFeePaidCents,
} from "./priorPaymentAllocation";

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

function normalizePaymentMethod(
  value: unknown
): "cash" | "check" {
  const method =
    cleanString(value).toLowerCase();

  if (
    method !== "cash" &&
    method !== "check"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "paymentMethod must be cash or check."
    );
  }

  return method;
}

function normalizePeriods(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      "periods must be an array."
    );
  }

  const periods = value
    .map(cleanString)
    .filter(Boolean);

  if (
    periods.length < 1 ||
    periods.length > 12 ||
    periods.some(
      (period) =>
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Each payment period must use YYYY-MM."
    );
  }

  return [...new Set(periods)];
}

export const recordProposalPriorPayment =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to record a prior payment."
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

    const paymentMethod =
      normalizePaymentMethod(
        req.data?.paymentMethod
      );

    const periods =
      normalizePeriods(
        req.data?.periods
      );

    const legacyEnrollmentFeeIncluded =
      req.data?.enrollmentFeeIncluded === true;
    const requestedEnrollmentFeeAmountCents =
      req.data?.enrollmentFeeAmountCents;

    const note =
      cleanString(req.data?.note) ||
      null;

    const db =
      getFirestore();

    const proposalRef =
      db
        .collection("proposals")
        .doc(proposalId);

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

          // Prior cash must be recorded before checkout or activation. The
          // client-review snapshot and Stripe checkout cannot be silently
          // amended by a late payment entry. Keep this aligned with the
          // Management Billing UI's available recording stages.
          if (
            currentStatus !== "DRAFT" &&
            currentStatus !== "AWAITING_CLIENT_SIGNATURE"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Prior payments must be recorded while the proposal is a draft or awaiting client signature, before checkout begins."
            );
          }

          const existing =
            Array.isArray(
              proposal.priorPayments
            )
              ? proposal.priorPayments
              : [];

          const duplicatePeriods = new Set<string>(
            existing.flatMap((payment: any) =>
              Array.isArray(payment?.periods) ? payment.periods : []
            )
          );
          const overlaps = periods.filter((period) => duplicatePeriods.has(period));
          if (overlaps.length) {
            throw new HttpsError(
              "already-exists",
              `A prior payment is already recorded for: ${overlaps.join(", ")}.`
            );
          }

          const enrollmentFeeCents = Math.max(
            0,
            Math.round(Number(proposal.pricing?.enrollmentBase || 0) * 100)
          );
          const enrollmentFeeAlreadyPaidCents = Math.min(
            enrollmentFeeCents,
            existing.reduce(
              (total: number, payment: Record<string, unknown>) =>
                total + enrollmentFeePaidCents(payment, enrollmentFeeCents),
              0
            )
          );
          let allocation;
          try {
            allocation = allocatePriorPayment({
              amountCents,
              requestedEnrollmentFeeAmountCents,
              legacyEnrollmentFeeIncluded,
              enrollmentFeeCents,
              enrollmentFeeAlreadyPaidCents,
            });
          } catch (error) {
            throw new HttpsError(
              "invalid-argument",
              error instanceof Error ? error.message : "Invalid payment allocation."
            );
          }
          const {
            enrollmentFeeAmountCents,
            membershipAmountCents,
            enrollmentFeeIncluded,
          } = allocation;

          const monthlyMembershipCents = Math.round(
            Number(proposal.pricing?.monthlyBalance || 0) * 100
          );
          if (monthlyMembershipCents <= 0) {
            throw new HttpsError(
              "failed-precondition",
              "The proposal does not contain a valid locked monthly membership amount."
            );
          }
          const existingPartialByPeriod = new Map<string, number>();
          for (const existingPayment of existing) {
            for (const raw of Array.isArray(existingPayment?.membershipPeriodAllocations)
              ? existingPayment.membershipPeriodAllocations
              : []) {
              const period = cleanString(raw?.period);
              const paidCents = Math.max(0, Number(raw?.paidCents) || 0);
              if (period && !duplicatePeriods.has(period)) {
                existingPartialByPeriod.set(
                  period,
                  (existingPartialByPeriod.get(period) || 0) + paidCents
                );
              }
            }
          }
          let membershipRemainingCents = membershipAmountCents;
          const membershipPeriodAllocations = periods.map((period) => {
            const previouslyPaidCents = Math.min(
              monthlyMembershipCents,
              existingPartialByPeriod.get(period) || 0
            );
            const capacityCents = monthlyMembershipCents - previouslyPaidCents;
            const paidCents = Math.min(capacityCents, membershipRemainingCents);
            membershipRemainingCents -= paidCents;
            const totalPaidCents = previouslyPaidCents + paidCents;
            return {
              period,
              paidCents,
              previouslyPaidCents,
              totalPaidCents,
              requiredCents: monthlyMembershipCents,
              fullyPaid: totalPaidCents >= monthlyMembershipCents,
            };
          });
          const fullyPaidPeriods = membershipPeriodAllocations
            .filter((entry) => entry.fullyPaid)
            .map((entry) => entry.period);

          const recordedAt =
            Timestamp.now();

          const historyRef =
            proposalRef
              .collection("history")
              .doc();

          const payment = {
            paymentId: historyRef.id,
            amountCents,
            membershipAmountCents,
            enrollmentFeeAmountCents,
            paymentMethod,
            requestedPeriods: periods,
            periods: fullyPaidPeriods,
            membershipPeriodAllocations,
            unappliedMembershipAmountCents: membershipRemainingCents,
            enrollmentFeeIncluded,
            note,
            recordedBy:
              req.auth!.uid,
            recordedByName:
              staffAccess.fullName,
            recordedAt,
          };

          tx.update(
            proposalRef,
            {
              priorPayments: [
                ...existing,
                payment,
              ],

              priorPaymentsTotalCents:
                Number(
                  proposal
                    .priorPaymentsTotalCents ||
                  0
                ) +
                amountCents,

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
                "PRIOR_PAYMENT_RECORDED",

              proposalStatus:
                currentStatus,

              amountCents,
              membershipAmountCents,
              enrollmentFeeAmountCents,
              paymentMethod,
              periods,
              fullyPaidPeriods,
              membershipPeriodAllocations,
              unappliedMembershipAmountCents: membershipRemainingCents,
              enrollmentFeeIncluded,
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
            proposalStatus:
              currentStatus,
            amountCents,
            membershipAmountCents,
            enrollmentFeeAmountCents,
            paymentMethod,
            periods,
            fullyPaidPeriods,
            membershipPeriodAllocations,
            unappliedMembershipAmountCents: membershipRemainingCents,
            enrollmentFeeIncluded,
          };
        }
      );

    return {
      ok: true,
      ...result,
    };
  });
