import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(
  value: unknown
): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function hasCoachAccess(
  token: Record<string, unknown>
): boolean {
  return (
    token.admin === true ||
    token.coach === true ||
    token.role === "admin" ||
    token.role === "coach"
  );
}

export const approveProposal =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to approve a proposal."
      );
    }

    const token =
      req.auth.token as Record<string, unknown>;

    if (!hasCoachAccess(token)) {
      throw new HttpsError(
        "permission-denied",
        "Coach or administrator access is required."
      );
    }

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
        token.name
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

            const currentStatus =
              cleanString(proposal.status);

            if (currentStatus !== "REVIEW") {
              throw new HttpsError(
                "failed-precondition",
                "Only REVIEW proposals may be approved."
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
                  "APPROVED",

                updatedBy:
                  callerUid,

                updatedAt:
                  FieldValue.serverTimestamp(),

                approvedBy:
                  callerUid,

                approvedAt:
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
                  "REVIEW",

                toStatus:
                  "APPROVED",

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
                "APPROVED" as const,
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
