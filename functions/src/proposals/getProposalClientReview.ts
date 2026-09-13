import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import {
  cleanReviewString,
  hashProposalReviewToken,
} from "./proposalClientReview";

export const getProposalClientReview =
  onCall(async (req) => {
    const proposalId =
      cleanReviewString(
        req.data?.proposalId
      );

    const token =
      cleanReviewString(
        req.data?.token
      );

    if (!proposalId || !token) {
      throw new HttpsError(
        "invalid-argument",
        "A valid proposal review link is required."
      );
    }

    const snap =
      await getFirestore()
        .collection("proposals")
        .doc(proposalId)
        .get();

    if (!snap.exists) {
      throw new HttpsError(
        "not-found",
        "This proposal could not be found."
      );
    }

    const proposal =
      snap.data() || {};

    const review =
      proposal.clientReview || {};

    if (
      hashProposalReviewToken(token) !==
      cleanReviewString(
        review.tokenHash
      )
    ) {
      throw new HttpsError(
        "permission-denied",
        "This proposal review link is invalid."
      );
    }

    const expiresAt =
      review.expiresAt;

    if (
      !(expiresAt instanceof Timestamp) ||
      expiresAt.toMillis() <
        Date.now()
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This proposal review link has expired."
      );
    }

    const allowedStatuses =
      new Set([
        "AWAITING_CLIENT_SIGNATURE",
        "CLIENT_SIGNED",
        "CLIENT_CHANGES_REQUESTED",
      ]);

    if (
      !allowedStatuses.has(
        cleanReviewString(
          proposal.status
        )
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This proposal is no longer available for client review."
      );
    }

    return {
      ok: true,

      proposalId,

      status:
        proposal.status,

      proposal:
        review.snapshot || null,

      signed:
        proposal.status ===
        "CLIENT_SIGNED",

      changesRequested:
        proposal.status ===
        "CLIENT_CHANGES_REQUESTED",
    };
  });
