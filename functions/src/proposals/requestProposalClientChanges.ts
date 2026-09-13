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
  cleanReviewString,
  hashProposalReviewToken,
} from "./proposalClientReview";

export const requestProposalClientChanges =
  onCall(async (req) => {
    const proposalId =
      cleanReviewString(
        req.data?.proposalId
      );

    const token =
      cleanReviewString(
        req.data?.token
      );

    const message =
      cleanReviewString(
        req.data?.message
      );

    if (
      !proposalId ||
      !token
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid proposal review link is required."
      );
    }

    if (message.length < 3) {
      throw new HttpsError(
        "invalid-argument",
        "Please tell us what you would like changed."
      );
    }

    const db =
      getFirestore();

    const proposalRef =
      db.collection("proposals")
        .doc(proposalId);

    await db.runTransaction(
      async (tx) => {
        const snap =
          await tx.get(
            proposalRef
          );

        if (!snap.exists) {
          throw new HttpsError(
            "not-found",
            "This proposal could not be found."
          );
        }

        const proposal =
          snap.data() || {};

        if (
          proposal.status !==
          "AWAITING_CLIENT_SIGNATURE"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This proposal is no longer awaiting client review."
          );
        }

        const review =
          proposal.clientReview || {};

        if (
          hashProposalReviewToken(
            token
          ) !==
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

        const historyRef =
          proposalRef
            .collection("history")
            .doc();

        tx.update(
          proposalRef,
          {
            status:
              "CLIENT_CHANGES_REQUESTED",

            clientChangeRequest: {
              message,

              requestedAt:
                FieldValue.serverTimestamp(),
            },

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        tx.create(
          historyRef,
          {
            proposalId,

            event:
              "CLIENT_CHANGES_REQUESTED",

            fromStatus:
              "AWAITING_CLIENT_SIGNATURE",

            toStatus:
              "CLIENT_CHANGES_REQUESTED",

            message,

            createdAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    return {
      ok: true,

      proposalId,

      status:
        "CLIENT_CHANGES_REQUESTED",
    };
  });
