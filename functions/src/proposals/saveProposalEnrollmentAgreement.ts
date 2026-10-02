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

function normalizedName(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const saveProposalEnrollmentAgreement =
  onCall(async (req) => {
    const proposalId =
      clean(req.data?.proposalId);

    const enrollmentToken =
      clean(req.data?.enrollmentToken);

    const agreement =
      req.data?.agreement &&
      typeof req.data.agreement === "object"
        ? req.data.agreement
        : {};

    const signerName =
      clean(agreement.signerName);

    const signature =
      clean(agreement.signature);

    if (
      !proposalId ||
      !enrollmentToken
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid enrollment verification link is required."
      );
    }

    if (
      agreement.standardsAccepted !== true ||
      agreement.proposalAccepted !== true
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Accept the enrollment standards and confirm the locked proposal before continuing."
      );
    }

    if (
      !signerName ||
      !signature ||
      normalizedName(
        signerName
      ) !==
        normalizedName(
          signature
        )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The digital signature must match the responsible party name."
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
            "Final enrollment verification is not available for this proposal status."
          );
        }

        const historyRef =
          proposalRef
            .collection("history")
            .doc();

        tx.update(
          proposalRef,
          {
            enrollmentAgreement: {
              version:
                "enrollment-verification-v1",

              standardsAccepted:
                true,

              proposalAccepted:
                true,

              signerName,
              signature,

              acceptedAt:
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
              "ENROLLMENT_AGREEMENT_VERIFIED",

            signerName,

            agreementVersion:
              "enrollment-verification-v1",

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
            true,

          proposalAccepted:
            true,

          signerName,

          signature:
            "",
        },
      },
    };
  });
