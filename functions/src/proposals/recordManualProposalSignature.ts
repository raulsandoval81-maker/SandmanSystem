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

export const recordManualProposalSignature =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to record a manual signature."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const proposalId =
      cleanString(req.data?.proposalId);

    const signerName =
      cleanString(req.data?.signerName);

    const signerRole =
      cleanString(req.data?.signerRole);

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    if (!signerName) {
      throw new HttpsError(
        "invalid-argument",
        "signerName is required."
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

    const db =
      getFirestore();

    const proposalRef =
      db
        .collection("proposals")
        .doc(proposalId);

    const result =
      await db.runTransaction(
        async (tx) => {
          const snap =
            await tx.get(proposalRef);

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

          const currentStatus =
            cleanString(
              proposal.status
            ).toUpperCase();

          if (
            currentStatus !==
            "AWAITING_CLIENT_SIGNATURE"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Only proposals awaiting client signature may be recorded as manually signed."
            );
          }

          const review =
            proposal.clientReview || {};

          if (!review.snapshot) {
            throw new HttpsError(
              "failed-precondition",
              "The proposal review snapshot is missing."
            );
          }

          const approvedBy =
            cleanString(
              review.issuedBy
            ) ||
            req.auth.uid;

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
                signerRole,

                consentAccepted:
                  true,

                signatureMethod:
                  "manual_form",

                recordedBy:
                  req.auth.uid,

                recordedByName:
                  staffAccess.fullName,

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

              updatedBy:
                req.auth.uid,

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

              signatureMethod:
                "manual_form",

              recordedBy:
                req.auth.uid,

              recordedByName:
                staffAccess.fullName,

              approvedBy,

              approvalSource:
                "manual_form",

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
  });
