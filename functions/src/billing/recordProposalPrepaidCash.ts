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

    const monthsCovered =
      toPositiveInteger(
        req.data?.monthsCovered,
        "monthsCovered"
      );

    const enrollmentFeePaid =
      req.data?.enrollmentFeePaid === true;

    const nextBillingDate =
      parseLocalDate(
        req.data?.nextBillingDate
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

            const nextStatus =
              isCheckoutReady
                ? "CASH_PREPAID_AUTOPAY_REQUIRED"
                : "PAID";

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
                  "AUTOPAY_SETUP_REQUIRED",

                paymentMethod:
                  "cash_prepaid",

                paymentStatus:
                  "PREPAID_CASH_RECORDED",

                cashPrepayment: {
                  amountCents,
                  monthsCovered,
                  enrollmentFeePaid,
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
                monthsCovered,
                enrollmentFeePaid,
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
              monthsCovered,
              enrollmentFeePaid,
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
