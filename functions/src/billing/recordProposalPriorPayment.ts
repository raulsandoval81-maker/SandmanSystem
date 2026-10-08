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
        !/^\d{4}-\d{2}$/.test(period)
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

    const enrollmentFeeIncluded =
      req.data?.enrollmentFeeIncluded === true;

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

          if (
            [
              "PAID",
              "VOID",
            ].includes(currentStatus)
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Prior payments must be recorded before the proposal is paid or void."
            );
          }

          const existing =
            Array.isArray(
              proposal.priorPayments
            )
              ? proposal.priorPayments
              : [];

          const duplicatePeriods =
            new Set(
              existing.flatMap(
                (payment: any) =>
                  Array.isArray(
                    payment?.periods
                  )
                    ? payment.periods
                    : []
              )
            );

          const overlaps =
            periods.filter(
              (period) =>
                duplicatePeriods.has(period)
            );

          if (overlaps.length) {
            throw new HttpsError(
              "already-exists",
              `A prior payment is already recorded for: ${overlaps.join(", ")}.`
            );
          }

          const recordedAt =
            Timestamp.now();

          const payment = {
            amountCents,
            paymentMethod,
            periods,
            enrollmentFeeIncluded,
            note,
            recordedBy:
              req.auth!.uid,
            recordedByName:
              staffAccess.fullName,
            recordedAt,
          };

          const historyRef =
            proposalRef
              .collection("history")
              .doc();

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
              paymentMethod,
              periods,
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
            paymentMethod,
            periods,
            enrollmentFeeIncluded,
          };
        }
      );

    return {
      ok: true,
      ...result,
    };
  });
