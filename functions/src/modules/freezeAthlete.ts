import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";
import { createHash } from "node:crypto";

import {
  createTestingEvent
} from "./testing-events/createTestingEvent";

import {
  createParentSignal,
  PARENT_SIGNAL_TYPES
} from "./parent/createParentSignal";

export async function freezeAthleteAuthoritatively(
  uidInput: unknown,
  scoreInput: unknown,
  actionIdentity = ""
) {
  const db = getFirestore();
  const uid =
    String(uidInput || "").trim();

  const score =
    Number(scoreInput);

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "Missing uid"
    );
  }

  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid score"
    );
  }

  if (score >= 85) {
    throw new HttpsError(
      "failed-precondition",
      "Score is 85 or higher. Use Pass Test."
    );
  }

  const athleteRef =
    db.collection("athletes").doc(uid);

  const freezeUntil =
    new Date();

  freezeUntil.setDate(
    freezeUntil.getDate() + 5
  );

  const result =
    await db.runTransaction(async (tx) => {
      const snap =
        await tx.get(athleteRef);

      if (!snap.exists) {
        throw new HttpsError(
          "not-found",
          `Athlete not found: ${uid}`
        );
      }

      const athlete =
        snap.data() || {};

      const receiptRef = actionIdentity
        ? db.doc(`athletes/${uid}/testingActionReceipts/${createHash("sha256")
            .update(`${uid}|FAIL|${actionIdentity}`).digest("hex").slice(0, 32)}`)
        : null;
      if (receiptRef) {
        const receiptSnap = await tx.get(receiptRef);
        if (receiptSnap.exists) {
          return { ...(receiptSnap.data()?.result || {}), ok: true, idempotent: true };
        }
      }

      const testingState =
        String(athlete?.testing?.state || "");

      if (testingState !== "TESTING") {
        throw new HttpsError(
          "failed-precondition",
          `Athlete must be TESTING before freeze. Current state: ${testingState}`
        );
      }

      const freezeResult = {
        ok: true,
        idempotent: false,
        uid,
        score,
        state: "FREEZE",
        freezeUntil: freezeUntil.toISOString(),
        tier: athlete.tier ?? null,
        parentUid: athlete.parentUid ?? null,
        publicName: athlete.publicName ?? athlete.fullName ?? uid,
      };

      tx.update(athleteRef, {
        tierStatus: "freeze",

        "testing.state": "FREEZE",
        "testing.lastTestResult": "fail",
        "testing.lastTestScore": score,
        "testing.passingScore": 85,
        "testing.freezeUntil": freezeUntil,
        "testing.cooldownUntil": null,
        "testing.testingStartedAt": null,
        "testing.coachReady": false,
        "testing.coachReadyAt": null,
        "testing.scheduledDate": null,
        "testing.scheduledAt": null,
        "testing.scheduledBy": null,

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      if (receiptRef) tx.create(receiptRef, {
        uid, actionIdentity, score, result: freezeResult,
        createdAt: FieldValue.serverTimestamp(),
      });
      return freezeResult;
    });

  if (result.ok && !result.idempotent) {
    const eventPayload = {
      uid: result.uid,
      type: "TEST_FAILED" as const,
      score: result.score,
      tier: result.tier,
      parentUid: result.parentUid,
      publicName: result.publicName,
    };

    await createTestingEvent(eventPayload);

    await createParentSignal({
      athleteId: result.uid,
      athleteName: result.publicName,
      type: PARENT_SIGNAL_TYPES.TEST_FAILED,
      source: "freezeAthlete",
      sourceId: result.uid,
    });

    await createParentSignal({
      athleteId: result.uid,
      athleteName: result.publicName,
      type: PARENT_SIGNAL_TYPES.TEST_FREEZE,
      source: "freezeAthlete",
      sourceId: result.uid,
    });
  }

  return result;
}

export const freezeAthlete = onCall(async (req) =>
  freezeAthleteAuthoritatively(req.data?.uid, req.data?.score));
