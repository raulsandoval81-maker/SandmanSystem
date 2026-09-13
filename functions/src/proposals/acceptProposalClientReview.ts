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

function normalizedName(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const acceptProposalClientReview =
  onCall(async (req) => {
    const proposalId =
      cleanReviewString(
        req.data?.proposalId
      );

    const token =
      cleanReviewString(
        req.data?.token
      );

    const signerName =
      cleanReviewString(
        req.data?.signerName
      );

    const signature =
      cleanReviewString(
        req.data?.signature
      );

    const signerRole =
      cleanReviewString(
        req.data?.signerRole
      );

    const consentAccepted =
      req.data?.consentAccepted === true;

    if (
      !proposalId ||
      !token ||
      !signerName ||
      !signature
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Complete the signature fields before accepting the proposal."
      );
    }

    if (
      normalizedName(signerName) !==
      normalizedName(signature)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The electronic signature must match the signer name."
      );
    }

    if (
      ![
        "parent_guardian",
        "adult_athlete",
      ].includes(signerRole)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Select the signer relationship."
      );
    }

    if (!consentAccepted) {
      throw new HttpsError(
        "failed-precondition",
        "You must acknowledge the proposal terms before signing."
      );
    }

    const db =
      getFirestore();

    const proposalRef =
      db.collection("proposals")
        .doc(proposalId);

    const result =
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
              "This proposal is no longer awaiting a signature."
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

          if (!review.snapshot) {
            throw new HttpsError(
              "failed-precondition",
              "The proposal review snapshot is missing."
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
                "READY_FOR_CHECKOUT",

              lockedSnapshot:
                review.snapshot,

              clientAcceptance: {
                signerName,
                signature,
                signerRole,

                consentAccepted:
                  true,

                snapshotVersion:
                  review.snapshotVersion ||
                  1,

                signedSnapshot:
                  review.snapshot,

                signedAt:
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
                "CLIENT_SIGNED",

              fromStatus:
                "AWAITING_CLIENT_SIGNATURE",

              toStatus:
                "READY_FOR_CHECKOUT",

              signerName,

              signerRole,

              createdAt:
                FieldValue.serverTimestamp(),
            }
          );

          return {
            status:
              "READY_FOR_CHECKOUT",
          };
        }
      );

    return {
      ok: true,
      proposalId,
      ...result,
    };
  });
