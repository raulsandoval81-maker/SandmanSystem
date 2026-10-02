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

    const historySnapshot =
      await db
        .collection(`proposals/${proposalId}/history`)
        .get();

    const sentEvents = historySnapshot.docs
      .map((snap) => ({
        id: snap.id,
        data: snap.data() || {},
      }))
      .filter(({ data: event }) =>
        [
          "INTAKE_INVITE_SENT",
          "INTAKE_INVITE_MANUALLY_SENT"
        ].includes(
          clean(event.event).toUpperCase()
        ) &&
        clean(event.intakeTokenId)
      )
      .sort((a, b) =>
        millis(b.data.occurredAt || b.data.createdAt) -
        millis(a.data.occurredAt || a.data.createdAt)
      );

    const sentByTokenId =
      new Map<string, Record<string, any>>();

    for (const entry of sentEvents) {
      const tokenId =
        clean(entry.data.intakeTokenId);

      if (
        tokenId &&
        !sentByTokenId.has(tokenId)
      ) {
        sentByTokenId.set(
          tokenId,
          entry.data
        );
      }
    }

    const tokenSnapshot =
      await db
        .collection("intakeTokens")
        .where("proposalId", "==", proposalId)
        .get();

    const tokenEntries =
      tokenSnapshot.docs.map((snap) => ({
        id: snap.id,
        data: snap.data() || {},
      }));

    // Older enrollment tokens may predate the current source/mode fields.
    // A matching INTAKE_INVITE_SENT history event is authoritative evidence
    // that the token belongs to this Management enrollment workflow.
    for (const sentEvent of sentEvents) {
      const tokenId =
        clean(sentEvent.data.intakeTokenId);

      if (
        tokenId &&
        !tokenEntries.some((entry) => entry.id === tokenId)
      ) {
        const legacyTokenSnap =
          await db.doc(`intakeTokens/${tokenId}`).get();

        if (legacyTokenSnap.exists) {
          tokenEntries.push({
            id: legacyTokenSnap.id,
            data: legacyTokenSnap.data() || {},
          });
        }
      }
    }

    const tokens = tokenEntries
      .filter(({ id, data: token }) => {
        if (token.used === true) return false;

        const currentWorkflow =
          clean(token.source).toLowerCase() === "management_enrollment" &&
          clean(token.mode || "new_athlete").toLowerCase() === "new_athlete";

        return currentWorkflow || sentByTokenId.has(id);
      })
      .sort((a, b) => {
        const aSent = sentByTokenId.has(a.id) ? 1 : 0;
        const bSent = sentByTokenId.has(b.id) ? 1 : 0;

        if (aSent !== bSent) {
          return bSent - aSent;
        }

        return (
          millis(b.data.updatedAt || b.data.createdAt) -
          millis(a.data.updatedAt || a.data.createdAt)
        );
      });

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
    const sentEvent =
      sentByTokenId.get(tokenEntry.id) || null;

    const deliveryStatus =
      clean(token.deliveryStatus).toUpperCase() ||
      (sentEvent ? "SENT" : "");

    const deliveredAt =
      millis(token.deliveredAt) ||
      millis(sentEvent?.occurredAt || sentEvent?.createdAt) ||
      null;

    const deliveredTo =
      clean(token.deliveredTo) ||
      clean(sentEvent?.recipient);

    const deliveryMethod =
      clean(token.deliveryMethod).toLowerCase() ||
      clean(sentEvent?.deliveryMethod).toLowerCase() ||
      (sentEvent ? "email" : "");

    const manualDelivery =
      token.manualDelivery === true ||
      clean(sentEvent?.event).toUpperCase() ===
        "INTAKE_INVITE_MANUALLY_SENT";

    const manualDeliveryNote =
      clean(token.manualDeliveryNote) ||
      clean(sentEvent?.note);

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
        deliveryStatus,
        deliveryMethod,
        manualDelivery,
        manualDeliveryNote,
        deliveredAt,
        deliveredTo,
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
      deliveryStatus,
      deliveryMethod,
      manualDelivery,
      manualDeliveryNote,
      deliveredAt,
      deliveredTo,
    };
  });
