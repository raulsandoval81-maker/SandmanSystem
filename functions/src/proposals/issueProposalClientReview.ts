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
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";

import {
  buildClientProposalSnapshot,
  cleanReviewString,
  createProposalReviewToken,
  hashProposalReviewToken,
} from "./proposalClientReview";

export const issueProposalClientReview =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to issue a client proposal review."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const proposalId =
      cleanReviewString(
        req.data?.proposalId
      );

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    const db =
      getFirestore();

    const proposalRef =
      db.collection("proposals")
        .doc(proposalId);

    const rawToken =
      createProposalReviewToken();

    const tokenHash =
      hashProposalReviewToken(
        rawToken
      );

    const expiresAt =
      Timestamp.fromMillis(
        Date.now() +
        7 * 24 * 60 * 60 * 1000
      );

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
              `Proposal ${proposalId} was not found.`
            );
          }

          const proposal =
            snap.data() || {};

          requireProposalLocationAccess(
            staffAccess,
            proposal.locationId
          );

          const status =
            cleanReviewString(
              proposal.status
            );

          if (
            status !== "REVIEW" &&
            status !==
              "AWAITING_CLIENT_SIGNATURE"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Only REVIEW proposals may be sent to the client."
            );
          }

          const existingSnapshot =
            proposal.clientReview?.snapshot;

          const clientSnapshot =
            existingSnapshot ||
            buildClientProposalSnapshot(
              proposalId,
              proposal
            );

          const historyRef =
            proposalRef
              .collection("history")
              .doc();

          tx.update(
            proposalRef,
            {
              status:
                "AWAITING_CLIENT_SIGNATURE",

              clientReview: {
                tokenHash,
                expiresAt,
                snapshotVersion: 1,
                snapshot:
                  clientSnapshot,

                issuedBy:
                  req.auth!.uid,

                issuedAt:
                  FieldValue.serverTimestamp(),
              },

              updatedBy:
                req.auth!.uid,

              updatedAt:
                FieldValue.serverTimestamp(),
            }
          );

          tx.create(
            historyRef,
            {
              proposalId,

              event:
                "CLIENT_REVIEW_ISSUED",

              fromStatus:
                status,

              toStatus:
                "AWAITING_CLIENT_SIGNATURE",

              createdBy:
                req.auth!.uid,

              createdAt:
                FieldValue.serverTimestamp(),
            }
          );

          return {
            status:
              "AWAITING_CLIENT_SIGNATURE",
          };
        }
      );

    return {
      ok: true,

      proposalId,

      ...result,

      reviewPath:
        "/connect/proposals/review/" +
        `?proposalId=${encodeURIComponent(
          proposalId
        )}` +
        `&token=${encodeURIComponent(
          rawToken
        )}`,

      expiresAt:
        expiresAt
          .toDate()
          .toISOString(),
    };
  });
