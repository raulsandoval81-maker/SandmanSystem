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

export const submitProposalMembershipChoice =
  onCall(async (req) => {
    const proposalId =
      cleanReviewString(
        req.data?.proposalId
      );

    const token =
      cleanReviewString(
        req.data?.token
      );

    const optionId =
      cleanReviewString(
        req.data?.optionId
      );

    if (
      !proposalId ||
      !token ||
      !optionId
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A proposal, secure token, and membership option are required."
      );
    }

    const db = getFirestore();

    const ref =
      db.collection("proposals")
        .doc(proposalId);

    const result =
      await db.runTransaction(
        async (tx) => {
          const snap =
            await tx.get(ref);

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
              "This proposal is no longer awaiting a membership choice."
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

          const request =
            proposal
              .membershipChoiceRequest ||
            {};

          const options =
            Array.isArray(
              request.options
            )
              ? request.options
              : [];

          const selected =
            options.find(
              (option: any) =>
                cleanReviewString(
                  option?.id
                ) === optionId
            );

          if (!request.active || !selected) {
            throw new HttpsError(
              "failed-precondition",
              "This membership option is not available."
            );
          }

          const response = {
            optionId,
            selectedOption:
              selected,
            selectedAt:
              FieldValue.serverTimestamp(),
          };

          const history =
            ref.collection("history").doc();

          tx.update(
            ref,
            {
              status:
                "CLIENT_CHANGES_REQUESTED",
              membershipChoiceResponse:
                response,
              "membershipChoiceRequest.active":
                false,
              updatedAt:
                FieldValue.serverTimestamp(),
            }
          );

          tx.create(
            history,
            {
              proposalId,
              event:
                "MEMBERSHIP_OPTION_SELECTED",
              fromStatus:
                "AWAITING_CLIENT_SIGNATURE",
              toStatus:
                "CLIENT_CHANGES_REQUESTED",
              optionId,
              selectedOption:
                selected,
              createdAt:
                FieldValue.serverTimestamp(),
            }
          );

          return {
            optionId,
            selectedOption:
              selected,
            status:
              "CLIENT_CHANGES_REQUESTED",
          };
        }
      );

    return {
      ok: true,
      proposalId,
      ...result,
    };
  });
