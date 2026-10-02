import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import {
  hashProposalReviewToken,
} from "./proposalClientReview";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function validateToken(
  proposal: Record<string, any>,
  enrollmentToken: string
) {
  const handoff =
    proposal.enrollmentHandoff || {};

  const expiresAt =
    handoff.expiresAt;

  if (
    hashProposalReviewToken(
      enrollmentToken
    ) !== clean(handoff.tokenHash) ||
    !(expiresAt instanceof Timestamp) ||
    expiresAt.toMillis() < Date.now()
  ) {
    throw new HttpsError(
      "permission-denied",
      "This enrollment verification link is invalid or expired."
    );
  }
}

export const getProposalEnrollment =
  onCall(async (req) => {
    const proposalId =
      clean(req.data?.proposalId);

    const enrollmentToken =
      clean(req.data?.enrollmentToken);

    if (
      !proposalId ||
      !enrollmentToken
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid enrollment verification link is required."
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
        "This enrollment could not be found."
      );
    }

    const proposal =
      snap.data() || {};

    validateToken(
      proposal,
      enrollmentToken
    );

    const status =
      clean(proposal.status)
        .toUpperCase();

    if (
      ![
        "READY_FOR_CHECKOUT",
        "CHECKOUT_CREATED",
        "PAID",
      ].includes(status)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This proposal is not available for final enrollment verification."
      );
    }

    const snapshot =
      proposal.lockedSnapshot &&
      typeof proposal.lockedSnapshot === "object"
        ? proposal.lockedSnapshot
        : {};

    const agreement =
      proposal.enrollmentAgreement &&
      typeof proposal.enrollmentAgreement === "object"
        ? proposal.enrollmentAgreement
        : {};

    const agreementAccepted =
      Boolean(
        agreement.acceptedAt
      );

    const paymentStatus =
      status === "PAID"
        ? "PAID"
        : status === "CHECKOUT_CREATED"
          ? "PAYMENT_PENDING"
          : "NOT_STARTED";

    const enrollmentStatus =
      status === "PAID"
        ? "PAID"
        : !agreementAccepted
          ? "AGREEMENT_IN_PROGRESS"
          : status === "CHECKOUT_CREATED"
            ? "PAYMENT_PENDING"
            : "READY_FOR_PAYMENT";

    return {
      ok: true,
      enrollment: {
        proposalId,
        status:
          enrollmentStatus,
        paymentStatus,
        paymentRequired:
          true,

        prospect:
          snapshot.prospect || {},

        athletes:
          Array.isArray(
            snapshot.athletes
          )
            ? snapshot.athletes
            : [],

        pricing:
          snapshot.pricing || {},

        fundingRoute:
          snapshot.pricing?.fundingRoute ||
          "STANDARD",

        agreement: {
          standardsAccepted:
            agreement.standardsAccepted ===
            true,

          proposalAccepted:
            agreement.proposalAccepted ===
            true,

          signerName:
            clean(
              agreement.signerName
            ),

          signature:
            "",
        },
      },
    };
  });

export {
  validateToken as validateProposalEnrollmentToken,
};
