import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";

import {
  createTestingEvent
} from "./testing-events/createTestingEvent";

import {
  createParentSignal,
  PARENT_SIGNAL_TYPES
} from "./parent/createParentSignal";

export const freezeAthlete = onCall(async (req) => {
  const db = getFirestore();

  const payload =
    req.data || {};

  const uid =
    String(payload.uid || "").trim();

  const score =
    Number(payload.score || 0);

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

      const testingState =
        String(athlete?.testing?.state || "");

      if (testingState !== "TESTING") {
        throw new HttpsError(
          "failed-precondition",
          `Athlete must be TESTING before freeze. Current state: ${testingState}`
        );
      }

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

      return {
        ok: true,
        uid,
        score,
        state: "FREEZE",
        freezeUntil:
          freezeUntil.toISOString(),

        tier:
          athlete.tier ?? null,

        parentUid:
          athlete.parentUid ?? null,

        publicName:
          athlete.publicName ??
          athlete.fullName ??
          uid,
      };
    });

  if (result.ok) {
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
});