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

      if (cleanString(proposal.status) !== "CLIENT_CHANGES_REQUESTED") {
        throw new HttpsError(
          "failed-precondition",
          "Only a proposal with client-requested changes may return to draft."
        );
      }

      const historyRef = proposalRef.collection("history").doc();

      tx.update(proposalRef, {
        status: "DRAFT",
        clientReview: FieldValue.delete(),
        updatedBy: req.auth!.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.create(historyRef, {
        proposalId,
        event: "STATUS_CHANGED",
        fromStatus: "CLIENT_CHANGES_REQUESTED",
        toStatus: "DRAFT",
        reason: "CLIENT_REVISION_REQUESTED",
        createdBy: req.auth!.uid,
        createdByName: staffAccess.fullName,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        proposalId,
        status: "DRAFT" as const,
      };
    });
  });
