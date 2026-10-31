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
import { buildHistoricalCashClientDisclosure } from "./proposalClientReview";
import { resolveHistoricalCashCheckoutTerms } from "../billing/historicalCashCheckoutTerms";

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
          // The family's acceptance cannot authorize stale cash terms.
          // Compare the current ledger/disposition to the frozen review
          // disclosure; changing either requires an entirely new review.
          if (Array.isArray(proposal.priorPayments) && proposal.priorPayments.length > 0) {
            let currentHistoricalCash;
            try {
              currentHistoricalCash = buildHistoricalCashClientDisclosure(proposal);
            } catch (error) {
              throw new HttpsError(
                "failed-precondition",
                error instanceof Error ? error.message : "Invalid historical cash disclosure."
              );
            }
            if (JSON.stringify(review.snapshot.historicalCash) !== JSON.stringify(currentHistoricalCash)) {
              throw new HttpsError(
                "failed-precondition",
                "Historical cash terms have changed. Management must reissue the family review before signing."
              );
            }
            let expectedTerms;
            try {
              expectedTerms = resolveHistoricalCashCheckoutTerms(proposal);
            } catch (error) {
              throw new HttpsError("failed-precondition",
                error instanceof Error ? error.message : "Historical cash checkout terms are invalid.");
            }
            const signedPricing = review.snapshot.pricing || {};
            if (JSON.stringify(review.snapshot.historicalCashCheckoutTerms) !== JSON.stringify(expectedTerms) ||
                Math.round(Number(signedPricing.dueNow) * 100) !== expectedTerms!.dueNowCents ||
                Math.round(Number(signedPricing.enrollmentDueNow) * 100) !== expectedTerms!.enrollmentRemainingCents ||
                Number(signedPricing.proratedFirstMonth) !== 0 ||
                Number(signedPricing.additionalMembershipMonthsDue) !== 0 ||
                String(signedPricing.firstRecurringChargeDate) !== expectedTerms!.firstRecurringChargeDate) {
              throw new HttpsError("failed-precondition",
                "Signed historical cash billing terms no longer match the approved ledger.");
            }
          }


          if (
            review.snapshot?.pricing?.billingType === "seasonal_one_time" &&
            signerRole !== "parent_guardian"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "A parent or guardian must approve a youth Winter Wrestling proposal.",
            );
          }

          const approvedBy =
            cleanReviewString(
              review.issuedBy
            );

          if (!approvedBy) {
            throw new HttpsError(
              "failed-precondition",
              "The Management approval record is missing from this proposal."
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

                acceptanceScope:
                  "proposal_acceptance_only",

                snapshotVersion:
                  review.snapshotVersion ||
                  1,

                signedSnapshot:
                  review.snapshot,

                signedAt:
                  FieldValue.serverTimestamp(),
              },

              approvedBy,

              approvedAt:
                review.issuedAt ||
                FieldValue.serverTimestamp(),

              lockedBy:
                approvedBy,

              lockedAt:
                review.issuedAt ||
                FieldValue.serverTimestamp(),

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

              acceptanceScope:
                "proposal_acceptance_only",

              approvedBy,

              approvalSource:
                "proposal_signature_request",

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
