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
} from "../proposals/proposalAccess";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeAudience(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export const supersedeEnrollmentIntakeInvites =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to update enrollment intake handoffs."
      );
    }

    const proposalId =
      clean(req.data?.proposalId);

    const audience =
      normalizeAudience(
        req.data?.intakeAudience
      );

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    if (
      audience !== "adult_athlete" &&
      audience !== "parent_guardian"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid intakeAudience is required."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const db =
      getFirestore();

    const proposalRef =
      db.collection("proposals")
        .doc(proposalId);

    const proposalSnap =
      await proposalRef.get();

    if (!proposalSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Proposal ${proposalId} was not found.`
      );
    }

    const proposal =
      proposalSnap.data() || {};

    requireProposalLocationAccess(
      staffAccess,
      proposal.locationId
    );

    if (
      clean(proposal.status).toUpperCase() !==
      "PAID"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Only paid proposals may update intake handoffs."
      );
    }

    const oppositeAudience =
      audience === "adult_athlete"
        ? "parent_guardian"
        : "adult_athlete";

    const historySnapshot =
      await proposalRef
        .collection("history")
        .get();

    const tokenIds =
      [...new Set(
        historySnapshot.docs
          .map((historyDoc) =>
            historyDoc.data() || {}
          )
          .filter((record) =>
            clean(record.event)
              .toUpperCase() ===
              "INTAKE_INVITE_CREATED" &&
            normalizeAudience(
              record.intakeAudience
            ) === oppositeAudience &&
            clean(record.intakeTokenId)
          )
          .map((record) =>
            clean(record.intakeTokenId)
          )
      )];

    let supersededCount = 0;

    for (const tokenId of tokenIds) {
      const tokenRef =
        db.collection("intakeTokens")
          .doc(tokenId);

      await db.runTransaction(
        async (tx) => {
          const tokenSnap =
            await tx.get(tokenRef);

          if (!tokenSnap.exists) {
            return;
          }

          const token =
            tokenSnap.data() || {};

          if (
            clean(token.proposalId) !==
              proposalId ||
            normalizeAudience(
              token.intakeAudience
            ) !== oppositeAudience ||
            clean(token.source)
              .toLowerCase() !==
              "management_enrollment" ||
            token.used === true
          ) {
            return;
          }

          tx.set(
            tokenRef,
            {
              used: true,
              status: "superseded",
              supersededAt:
                FieldValue.serverTimestamp(),
              supersededByAudience:
                audience,
              supersededBy:
                req.auth!.uid,
              updatedAt:
                FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          supersededCount += 1;
        }
      );
    }

    return {
      ok: true,
      proposalId,
      intakeAudience: audience,
      supersededCount,
    };
  });
