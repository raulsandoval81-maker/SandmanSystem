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
      "This Review & Confirm link is invalid or expired."
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
        "A valid Review & Confirm link is required."
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
        "This proposal is not available for Review & Confirm."
      );
    }

    const snapshot =
      proposal.lockedSnapshot &&
      typeof proposal.lockedSnapshot === "object"
        ? proposal.lockedSnapshot
        : {};

    const confirmation =
      proposal.enrollmentConfirmation &&
      typeof proposal.enrollmentConfirmation === "object"
        ? proposal.enrollmentConfirmation
        : {};

    const athletes =
      Array.isArray(
        snapshot.athletes
      )
        ? snapshot.athletes
        : [];

    const primaryAthlete =
      athletes[0] &&
      typeof athletes[0] === "object"
        ? athletes[0] as Record<string, unknown>
        : {};

    const enrollmentAudience =
      clean(
        primaryAthlete.enrollmentType
      ).toLowerCase() === "adult"
        ? "adult_athlete"
        : "parent_guardian";

    const termsConfirmed =
      confirmation.termsConfirmed === true &&
      Boolean(
        confirmation.confirmedAt
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
        : !termsConfirmed
          ? "READY_FOR_ENROLLMENT"
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

        athletes,

        enrollmentAudience,

        pricing:
          snapshot.pricing || {},

        fundingRoute:
          snapshot.pricing?.fundingRoute ||
          "STANDARD",

        confirmation: {
          termsConfirmed:
            confirmation.termsConfirmed ===
            true,
        },
      },
    };
  });

export {
  validateToken as validateProposalEnrollmentToken,
};
