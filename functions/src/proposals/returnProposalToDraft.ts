import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";

import {
  getStripe,
} from "../billing/stripeClient";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

export const returnProposalToDraft =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to revise a proposal."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(req.auth.uid);

    const proposalId =
      cleanString(req.data?.proposalId);

    const correctionReason =
      cleanString(req.data?.reason);

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    const db = getFirestore();
    const proposalRef = db.collection("proposals").doc(proposalId);

    return db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(proposalRef);

      if (!proposalSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Proposal ${proposalId} was not found.`
        );
      }

      const proposal = proposalSnap.data() || {};

      requireProposalLocationAccess(
        staffAccess,
        proposal.locationId
      );

      const status =
        cleanString(proposal.status).toUpperCase();

      const clientRequestedChange =
        status === "CLIENT_CHANGES_REQUESTED";

      const managementCorrection =
        status === "REVIEW" ||
        status === "AWAITING_CLIENT_SIGNATURE";

      if (
        !clientRequestedChange &&
        !managementCorrection &&
        !checkoutCorrection
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This proposal cannot be reopened from its current stage. Signed, checkout, payment, and enrollment stages require the appropriate downstream correction path."
        );
      }

      if (
        managementCorrection &&
        correctionReason.length < 8
      ) {
        throw new HttpsError(
          "invalid-argument",
          "A correction reason of at least 8 characters is required."
        );
      }

      const checkoutCorrection =
        status === "READY_FOR_CHECKOUT" ||
        status === "CHECKOUT_CREATED";

      if (
        checkoutCorrection &&
        proposal.pendingCheckoutSessionId
      ) {
        try {
          const stripe = getStripe();
          const session =
            await stripe.checkout.sessions.retrieve(
              proposal.pendingCheckoutSessionId
            );

          if (session.status === "open") {
            await stripe.checkout.sessions.expire(
              proposal.pendingCheckoutSessionId
            );
          }
        } catch (error) {
          console.warn(
            "[returnProposalToDraft] unable to expire old checkout session",
            error
          );
        }
      }

      const historyRef = proposalRef.collection("history").doc();

      tx.update(proposalRef, {
        status: "DRAFT",
        clientReview: FieldValue.delete(),
        clientAcceptance: FieldValue.delete(),
        lockedSnapshot: FieldValue.delete(),
        approvedAt: FieldValue.delete(),
        approvedBy: FieldValue.delete(),
        lockedAt: FieldValue.delete(),
        lockedBy: FieldValue.delete(),
        pendingCheckoutSessionId: FieldValue.delete(),
        checkoutSessionCreatedAt: FieldValue.delete(),
        updatedBy: req.auth!.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.create(historyRef, {
        proposalId,
        event: "STATUS_CHANGED",
        fromStatus: status,
        toStatus: "DRAFT",
        reason: clientRequestedChange
          ? "CLIENT_REVISION_REQUESTED"
          : "MANAGEMENT_CORRECTION",
        correctionReason: managementCorrection
          ? correctionReason
          : "",
        createdBy: req.auth!.uid,
        createdByName: staffAccess.fullName,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        proposalId,
        status: "DRAFT" as const,
        correction:
          managementCorrection,
      };
    });
  });
