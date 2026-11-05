import { paymentArrangement, lockedPrepaidTerms } from "./paymentArrangement";
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
  enrollmentFeePaidCents,
  resolveHistoricalEnrollmentFeeAttributions,
} from "./priorPaymentAllocation";
import {
  resolveFullYearPrepayment,
  validateFullYearCoverage,
} from "./prepaidMembershipPolicy";
import {
  assertPrepaidFamilyConfirmation,
  assertPrepaidReconciliationCanBePrepared,
  hasConflictingStripeActivity,
  hasRecordedMembershipPayment,
  lockedPrepaidCoverageMonths,
} from "./prepaidReconciliationPolicy";

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

  const [year, month, day] = raw.split("-").map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day, 12));
  if (calendarCheck.toISOString().slice(0, 10) !== raw) {
    throw new HttpsError("invalid-argument", "nextBillingDate is invalid.");
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

    const mode = cleanString(req.data?.mode || "record").toLowerCase();
    if (![
      "prepare",
      "record",
    ].includes(mode)) {
      throw new HttpsError("invalid-argument", "Unsupported prepaid reconciliation mode.");
    }

    const db = getFirestore();
    const proposalRef = db.collection("proposals").doc(proposalId);

    if (mode === "prepare") {
      try {
        return await db.runTransaction(async (tx) => {
          const proposalSnap = await tx.get(proposalRef);
          if (!proposalSnap.exists) {
            throw new HttpsError("not-found", `Proposal ${proposalId} was not found.`);
          }
          const proposal = proposalSnap.data() || {};
          requireProposalLocationAccess(staffAccess, proposal.locationId);
          try {
            if (paymentArrangement(proposal.lockedSnapshot?.pricing || {}) === "prepaid_stripe") throw new Error("Online prepaid proposals cannot enter cash reconciliation.");
            assertPrepaidReconciliationCanBePrepared(proposal);
          } catch (error) {
            throw new HttpsError(
              "failed-precondition",
              error instanceof Error ? error.message : "This proposal is not eligible for prepaid reconciliation."
            );
          }
          if (proposal.prepaidReconciliation?.status === "AWAITING_FAMILY_CONFIRMATION") {
            return { ok: true, proposalId, status: "AWAITING_FAMILY_CONFIRMATION", idempotent: true };
          }
          tx.update(proposalRef, {
            prepaidReconciliation: {
              status: "AWAITING_FAMILY_CONFIRMATION",
              route: "management_prepaid_reconciliation",
              preparedBy: req.auth!.uid,
              preparedByName: staffAccess.fullName,
              preparedAt: FieldValue.serverTimestamp(),
            },
            updatedBy: req.auth!.uid,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.create(proposalRef.collection("history").doc(), {
            proposalId,
            event: "PREPAID_RECONCILIATION_PREPARED",
            fromStatus: cleanString(proposal.status).toUpperCase(),
            toStatus: cleanString(proposal.status).toUpperCase(),
            createdBy: req.auth!.uid,
            createdByName: staffAccess.fullName,
            createdAt: FieldValue.serverTimestamp(),
          });
          return { ok: true, proposalId, status: "AWAITING_FAMILY_CONFIRMATION", idempotent: false };
        });
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Unable to prepare paid-in-full reconciliation.");
      }
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

    const paymentDate = parseLocalDate(paymentDateRaw);
    const membershipStartDate = parseLocalDate(membershipStartDateRaw);
    const membershipPaidThroughDate = parseLocalDate(membershipPaidThroughDateRaw);

    const nextBillingDate =
      parseLocalDate(
        nextBillingDateRaw
      );

    if (paymentDate.toMillis() > Date.now()) {
      throw new HttpsError("invalid-argument", "Original payment date cannot be in the future.");
    }

    const note =
      cleanString(req.data?.note) ||
      null;

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

            const arrangement = paymentArrangement(proposal.lockedSnapshot?.pricing || {});
            if (arrangement === "prepaid_stripe") throw new HttpsError("failed-precondition", "Online prepayment requires verified Stripe confirmation.");
            const hasStripePayment = hasConflictingStripeActivity(proposal);

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

            try {
              assertPrepaidReconciliationCanBePrepared(proposal);
              assertPrepaidFamilyConfirmation(proposal);
            } catch (error) {
              throw new HttpsError(
                "failed-precondition",
                error instanceof Error ? error.message : "This proposal is not ready for prepaid reconciliation."
              );
            }
            if (hasRecordedMembershipPayment(proposal)) {
              throw new HttpsError(
                "already-exists",
                "A membership payment is already recorded for this proposal."
              );
            }

            // Use the accepted agreement term, never a client-supplied duration.
            const monthsCovered = lockedPrepaidCoverageMonths(proposal);
            try {
              validateFullYearCoverage(
                membershipStartDateRaw,
                membershipPaidThroughDateRaw,
                nextBillingDateRaw,
                monthsCovered
              );
            } catch (error) {
              throw new HttpsError(
                "invalid-argument",
                error instanceof Error ? error.message : "Invalid prepaid coverage dates."
              );
            }

            const pricing = proposal.pricing || {};
            const lockedPricing = proposal.lockedSnapshot?.pricing || {};
            const lockedMembershipStartDate = cleanString(
              lockedPricing.membershipStartDate ||
              proposal.agreement?.membershipStartDate ||
              pricing.membershipStartDate
            );
            if (!lockedMembershipStartDate ||
                membershipStartDateRaw !== lockedMembershipStartDate) {
              throw new HttpsError(
                "invalid-argument",
                "Prepaid coverage must begin on the locked membership start date."
              );
            }
            const monthlyMembershipCents = Math.round(
              Number(lockedPricing.monthlyBalance || pricing.monthlyBalance || 0) * 100
            );
            const enrollmentFeeTotalCents = Math.round(
              Number(lockedPricing.enrollmentBase || pricing.enrollmentBase || 0) * 100
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
            const attributionSources = [...priorPayments];
            if (pricingEnrollmentCents > priorPaymentEnrollmentCents) {
              attributionSources.push({
                paymentId: "pricing/enrollmentPreviouslyPaidAmount",
                enrollmentFeeAmountCents:
                  pricingEnrollmentCents - priorPaymentEnrollmentCents,
              });
            }
            const eligibleAthleteIndexes = (Array.isArray(proposal.athletes)
              ? proposal.athletes
              : [])
              .map((athlete: any, index: number) => ({ athlete, athleteIndex: index + 1 }))
              .filter(({ athlete }: any) => cleanString(athlete?.plan || "standard") !== "fitness")
              .map(({ athleteIndex }: any) => athleteIndex);
            let historicalAttributions;
            try {
              historicalAttributions = resolveHistoricalEnrollmentFeeAttributions({
                priorPayments: attributionSources,
                enrollmentFeeCents: enrollmentFeeTotalCents,
                eligibleAthleteIndexes,
                requestedAttributions: req.data?.historicalEnrollmentFeeAttributions,
              });
            } catch (error) {
              throw new HttpsError(
                "invalid-argument",
                error instanceof Error ? error.message : "Invalid historical enrollment-fee attribution."
              );
            }
            let allocation;
            try {
              allocation = resolveFullYearPrepayment({
                amountCents,
                membershipAmountCents,
                expectedMonthlyMembershipCents: monthlyMembershipCents,
                monthsCovered,
                enrollmentFeeTotalCents,
                enrollmentFeePreviouslyPaidCents: Math.max(
                  priorPaymentEnrollmentCents,
                  pricingEnrollmentCents
                ),
                enrollmentFeePreviouslyPaidAllocations:
                  historicalAttributions.map((entry) => ({
                    athleteIndex: entry.athleteIndex,
                    amountCents: entry.amountCents,
                  })),
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

            if (arrangement === "prepaid_cash_check") {
              const signed = lockedPrepaidTerms(proposal);
              if (amountCents !== signed.amountCents ||
                  JSON.stringify(allocation.annualEnrollmentFee.selections) !== JSON.stringify(signed.annualEnrollmentFee.selections)) {
                throw new HttpsError("failed-precondition", "Payment allocation must match the family-confirmed prepaid agreement.");
              }
            }
            const nextStatus =
              "PAID";

            const historyRef =
              proposalRef
                .collection("history")
                .doc();
            const attributedAt = Timestamp.now();
            const attributionRecords = historicalAttributions.map((entry) => ({
              ...entry,
              attributedBy: req.auth!.uid,
              attributedByName: staffAccess.fullName,
              attributedAt,
            }));
            const attributionHistoryRef = attributionRecords.length
              ? proposalRef.collection("history").doc()
              : null;

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
                  monthsCovered,
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

                "prepaidReconciliation.status":
                  "RECORDED",

                "prepaidReconciliation.recordedAt":
                  FieldValue.serverTimestamp(),

                "prepaidReconciliation.recordedBy":
                  req.auth!.uid,

                enrollmentFeeAttributions: attributionRecords,

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
                monthsCovered,
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

            if (attributionHistoryRef) {
              tx.create(attributionHistoryRef, {
                proposalId,
                event: "ENROLLMENT_FEE_ATTRIBUTIONS_RECORDED",
                attributions: attributionRecords,
                createdBy: req.auth!.uid,
                createdByName: staffAccess.fullName,
                createdAt: FieldValue.serverTimestamp(),
              });
            }

            return {
              proposalId,
              status:
                nextStatus,
              amountCents,
              membershipAmountCents: allocation.membershipAmountCents,
              membershipPaidInFull: true,
              monthsCovered,
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
