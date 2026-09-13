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

export const approveProposal =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to approve a proposal."
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

            if (currentStatus !== "CLIENT_SIGNED") {
              throw new HttpsError(
                "failed-precondition",
                "Only client-signed proposals may be approved."
              );
            }

            const signedSnapshot =
              proposal.clientAcceptance?.signedSnapshot;

            if (
              !signedSnapshot ||
              typeof signedSnapshot !== "object"
            ) {
              throw new HttpsError(
                "failed-precondition",
                "The signed proposal snapshot is missing."
              );
            }

            const lockedSnapshot =
              signedSnapshot;

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            tx.update(
              proposalRef,
              {
                status:
                  "READY_FOR_CHECKOUT",

                lockedSnapshot,

                updatedBy:
                  callerUid,

                updatedAt:
                  FieldValue.serverTimestamp(),

                approvedBy:
                  callerUid,

                approvedAt:
                  FieldValue.serverTimestamp(),

                lockedBy:
                  callerUid,

                lockedAt:
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
                  "CLIENT_SIGNED",

                toStatus:
                  "READY_FOR_CHECKOUT",

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
                "READY_FOR_CHECKOUT" as const,
            };
          }
        );

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      console.error(
        "[approveProposal] Failed:",
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to approve the proposal."
      );
    }
  });