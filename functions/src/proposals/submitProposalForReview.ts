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

function nullableString(
  value: unknown
): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

export const submitProposalForReview =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to submit a proposal."
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

    const callerUid =
      req.auth.uid;

    const coachName =
      nullableString(
        req.data?.coachName ||
        staffAccess.fullName
      );

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
              cleanString(proposal.status);

            if (currentStatus !== "DRAFT") {
              throw new HttpsError(
                "failed-precondition",
                "Only DRAFT proposals may be submitted for review."
              );
            }

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            tx.update(
              proposalRef,
              {
                status:
                  "REVIEW",

                updatedBy:
                  callerUid,

                updatedAt:
                  FieldValue.serverTimestamp(),

                submittedForReviewBy:
                  callerUid,

                submittedForReviewAt:
                  FieldValue.serverTimestamp(),
              }
            );

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  "STATUS_CHANGED",

                fromStatus:
                  "DRAFT",

                toStatus:
                  "REVIEW",

                createdBy:
                  callerUid,

                createdByName:
                  coachName,

                createdAt:
                  FieldValue.serverTimestamp(),
              }
            );

            return {
              proposalId,
              status:
                "REVIEW" as const,
            };
          }
        );

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      console.error(
        "[submitProposalForReview] Failed:",
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to submit the proposal for review."
      );
    }
  });
