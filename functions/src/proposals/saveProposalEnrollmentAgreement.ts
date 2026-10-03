import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  validateProposalEnrollmentToken,
} from "./getProposalEnrollment";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export const saveProposalEnrollmentAgreement =
  onCall(async (req) => {
    const proposalId =
      clean(req.data?.proposalId);

    const enrollmentToken =
      clean(req.data?.enrollmentToken);

    const confirmation =
      req.data?.confirmation &&
      typeof req.data.confirmation === "object"
        ? req.data.confirmation
        : {};

    if (
      !proposalId ||
      !enrollmentToken
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid Review & Confirm link is required."
      );
    }

    if (
      confirmation.termsConfirmed !== true
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Confirm the enrollment and billing details before continuing."
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
          await tx.get(proposalRef);

        if (!snap.exists) {
          throw new HttpsError(
            "not-found",
            "This enrollment could not be found."
          );
        }

        const proposal =
          snap.data() || {};

        validateProposalEnrollmentToken(
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
          ].includes(status)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Enrollment confirmation is not available for this proposal status."
          );
        }

        const snapshot =
          proposal.lockedSnapshot || {};

        const priorAcceptance =
          proposal.clientAcceptance || {};

        const prospect =
          snapshot.prospect || {};

        const athletes =
          Array.isArray(snapshot.athletes)
            ? snapshot.athletes
            : [];

        const confirmedByName =
          clean(priorAcceptance.signerName) ||
          clean(prospect.primaryContactName) ||
          clean(athletes[0]?.name) ||
          null;

        const historyRef =
          proposalRef
            .collection("history")
            .doc();

        tx.update(
          proposalRef,
          {
            enrollmentConfirmation: {
              version:
                "pricing-confirmation-v1",

              termsConfirmed:
                true,

              confirmedByName,

              confirmationSource:
                "secure_enrollment_link",

              confirmedAt:
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
              "ENROLLMENT_TERMS_CONFIRMED",

            confirmationVersion:
              "pricing-confirmation-v1",

            confirmedByName,

            createdAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    const saved =
      await proposalRef.get();

    const proposal =
      saved.data() || {};

    const snapshot =
      proposal.lockedSnapshot || {};

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

    return {
      ok: true,
      enrollment: {
        proposalId,
        status:
          clean(proposal.status)
            .toUpperCase() ===
            "CHECKOUT_CREATED"
              ? "PAYMENT_PENDING"
              : "READY_FOR_PAYMENT",

        paymentStatus:
          clean(proposal.status)
            .toUpperCase() ===
            "CHECKOUT_CREATED"
              ? "PAYMENT_PENDING"
              : "NOT_STARTED",

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
            true,
        },
      },
    };
  });
