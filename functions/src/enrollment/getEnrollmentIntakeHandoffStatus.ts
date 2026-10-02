import * as functions from "firebase-functions";
import {
  getFirestore
} from "firebase-admin/firestore";

import {
  MANAGEMENT_STAFF_ROLES,
  requireActiveStaff,
  requireStaffLocation
} from "../services/staffAuthorization";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function millis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export const getEnrollmentIntakeHandoffStatus =
  functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Management sign-in is required."
      );
    }

    const actor = await requireActiveStaff(
      context.auth.uid,
      MANAGEMENT_STAFF_ROLES,
      "Active Management access is required."
    );

    const proposalId = clean(data?.proposalId);
    const requestedAudience =
      clean(data?.intakeAudience).toLowerCase();

    if (!proposalId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Proposal ID is required."
      );
    }

    const proposalSnap =
      await db.doc(`proposals/${proposalId}`).get();

    if (!proposalSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Enrollment proposal not found."
      );
    }

    const proposal = proposalSnap.data() || {};

    requireStaffLocation(
      actor,
      clean(proposal.locationId),
      "This enrollment is outside your Management location scope."
    );

    const intakeSnapshot =
      await db
        .collection("intakes")
        .where("proposalId", "==", proposalId)
        .limit(5)
        .get();

    const submitted = intakeSnapshot.docs.find((snap) => {
      const intake = snap.data() || {};
      return ["submitted", "approved"].includes(
        clean(intake.status).toLowerCase()
      );
    });

    if (submitted) {
      return {
        ok: true,
        state: "submitted",
        intakeId: submitted.id,
        proposalId,
        intakeAudience:
          clean(submitted.data()?.intakeAudience).toLowerCase() ||
          (requestedAudience === "adult_athlete"
            ? "adult_athlete"
            : "parent_guardian"),
      };
    }

    const tokenSnapshot =
      await db
        .collection("intakeTokens")
        .where("proposalId", "==", proposalId)
        .get();

    const tokens = tokenSnapshot.docs
      .map((snap) => ({
        id: snap.id,
        data: snap.data() || {},
      }))
      .filter(({ data: token }) =>
        clean(token.source).toLowerCase() === "management_enrollment" &&
        clean(token.mode || "new_athlete").toLowerCase() === "new_athlete" &&
        token.used !== true
      )
      .sort((a, b) =>
        millis(b.data.updatedAt || b.data.createdAt) -
        millis(a.data.updatedAt || a.data.createdAt)
      );

    const tokenEntry = tokens[0];

    if (!tokenEntry) {
      return {
        ok: true,
        state: "none",
        proposalId,
        intakeAudience:
          requestedAudience === "adult_athlete"
            ? "adult_athlete"
            : "parent_guardian",
      };
    }

    const token = tokenEntry.data;
    const exp = Number(token.exp || 0);

    if (exp && exp <= Date.now()) {
      return {
        ok: true,
        state: "expired",
        tokenId: tokenEntry.id,
        proposalId,
        intakeAudience:
          clean(token.intakeAudience).toLowerCase() === "adult_athlete"
            ? "adult_athlete"
            : "parent_guardian",
        exp,
        deliveryStatus: clean(token.deliveryStatus).toUpperCase(),
        deliveredAt: millis(token.deliveredAt) || null,
        deliveredTo: clean(token.deliveredTo),
      };
    }

    return {
      ok: true,
      state: "active",
      tokenId: tokenEntry.id,
      proposalId,
      intakeAudience:
        clean(token.intakeAudience).toLowerCase() === "adult_athlete"
          ? "adult_athlete"
          : "parent_guardian",
      exp,
      deliveryStatus: clean(token.deliveryStatus).toUpperCase(),
      deliveredAt: millis(token.deliveredAt) || null,
      deliveredTo: clean(token.deliveredTo),
    };
  });
