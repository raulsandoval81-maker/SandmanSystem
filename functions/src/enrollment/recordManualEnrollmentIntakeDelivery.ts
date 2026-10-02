import * as functions from "firebase-functions";
import {
  FieldValue,
  getFirestore
} from "firebase-admin/firestore";

import {
  MANAGEMENT_STAFF_ROLES,
  requireActiveStaff,
  requireStaffLocation
} from "../services/staffAuthorization";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function isOperationalPaidProposal(
  proposal: Record<string, any>
): boolean {
  const status = clean(proposal.status).toUpperCase();
  const paymentStatus =
    clean(proposal.paymentStatus).toLowerCase();
  const paymentMethod =
    clean(proposal.paymentMethod).toLowerCase();
  const checkoutSessionId =
    clean(proposal.stripeCheckoutSessionId);

  const isLiveSession =
    proposal.stripeLivemode === true ||
    checkoutSessionId.startsWith("cs_live_");

  const isRecordedCashPayment =
    paymentMethod === "cash_prepaid" &&
    Boolean(proposal.cashPrepayment) &&
    Number(proposal.cashPrepayment?.amountCents || 0) > 0;

  return (
    status === "PAID" &&
    paymentStatus === "paid" &&
    Boolean(proposal.paidAt) &&
    (
      isRecordedCashPayment ||
      (
        Boolean(checkoutSessionId) &&
        !checkoutSessionId.startsWith("cs_test_") &&
        isLiveSession
      )
    )
  );
}

const ALLOWED_METHODS =
  new Set(["text", "in_person", "other"]);

export const recordManualEnrollmentIntakeDelivery =
  functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Management sign-in is required."
      );
    }

    const actor = await requireActiveStaff(
      context.auth.uid,
      MANAGEMENT_STAFF_ROLES,
      "Active Management access is required."
    );

    const tokenId = clean(data?.tokenId);
    const method = clean(data?.method).toLowerCase();
    const note = clean(data?.note).slice(0, 500);

    if (!tokenId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Intake token is required."
      );
    }

    if (!ALLOWED_METHODS.has(method)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Delivery method must be text, in_person, or other."
      );
    }

    const tokenRef =
      db.doc(`intakeTokens/${tokenId}`);

    const tokenSnap =
      await tokenRef.get();

    if (!tokenSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Intake handoff not found."
      );
    }

    const token = tokenSnap.data() || {};

    if (
      clean(token.source).toLowerCase() !== "management_enrollment" ||
      clean(token.mode || "new_athlete").toLowerCase() !== "new_athlete"
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This is not a Management enrollment intake handoff."
      );
    }

    if (token.used === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This intake has already been submitted."
      );
    }

    const exp = Number(token.exp || 0);

    if (exp && exp <= Date.now()) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This intake link has expired. Create a new handoff before marking it sent."
      );
    }

    const proposalId = clean(token.proposalId);

    if (!proposalId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Enrollment proposal is missing."
      );
    }

    const proposalSnap =
      await db.doc(`proposals/${proposalId}`).get();

    if (!proposalSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Enrollment proposal not found."
      );
    }

    const proposal = proposalSnap.data() || {};

    requireStaffLocation(
      actor,
      clean(token.locationId || proposal.locationId),
      "This enrollment is outside your Management location scope."
    );

    if (!isOperationalPaidProposal(proposal)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Manual intake delivery can only be recorded for a live paid enrollment."
      );
    }

    const intakeAudience =
      clean(token.intakeAudience).toLowerCase() === "adult_athlete"
        ? "adult_athlete"
        : "parent_guardian";

    const deliveredTo =
      method === "text"
        ? clean(token.prefill?.phone)
        : "";

    const now =
      FieldValue.serverTimestamp();

    await tokenRef.set(
      {
        deliveryStatus: "SENT",
        deliveryMethod: method,
        deliveredAt: now,
        deliveredTo,
        deliveredByUid: context.auth.uid,
        manualDelivery: true,
        manualDeliveryNote: note || null,
        updatedAt: now,
      },
      { merge: true }
    );

    const eventRef =
      db
        .collection(`proposals/${proposalId}/history`)
        .doc();

    await eventRef.set({
      proposalId,
      event: "INTAKE_INVITE_MANUALLY_SENT",
      fromStatus: "PAID",
      toStatus: "PAID",
      createdBy: context.auth.uid,
      createdByName: "Management",
      intakeTokenId: tokenId,
      intakeAudience,
      deliveryMethod: method,
      recipient: deliveredTo || null,
      note: note || null,
      source: "management_enrollment_manual_delivery",
      occurredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      proposalId,
      tokenId,
      intakeAudience,
      deliveryMethod: method,
      deliveredTo,
      note,
    };
  });
