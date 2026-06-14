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
  createParentSignal
} from "./parent/createParentSignal";

import {
  PARENT_SIGNAL_TYPES
} from "./parent/parentSignalTypes";

export const retestAthlete = onCall(async (req) => {
  const db = getFirestore();

  const uid =
    String(req.data?.uid || "").trim();

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "Missing uid"
    );
  }

  const athleteRef =
    db.collection("athletes").doc(uid);

  const result =
    await db.runTransaction(async (tx) => {
      const snap =
        await tx.get(athleteRef);

      if (!snap.exists) {
        throw new HttpsError(
          "not-found",
          "Athlete not found"
        );
      }

      const athlete =
        snap.data() || {};

      const state =
        String(
          athlete?.testing?.state || ""
        );

      if (state !== "FREEZE") {
        throw new HttpsError(
          "failed-precondition",
          `Athlete must be FREEZE. Current state: ${state}`
        );
      }

      tx.update(athleteRef, {
        tierStatus: "eligible",

        "testing.state": "ELIGIBLE",

        "testing.freezeUntil": null,
        "testing.cooldownUntil": null,

        "testing.lastTestResult": null,
        "testing.lastTestScore": null,

        "testing.coachReady": false,
        "testing.coachReadyAt": null,

        "testing.testingStartedAt": null,

        "testing.scheduledDate": null,
        "testing.scheduledAt": null,
        "testing.scheduledBy": null,

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      return {
        uid,
        athleteName:
          athlete.publicName ||
          athlete.fullName ||
          uid,
        tier:
          athlete.tier ?? null,
      };
    });

  await createTestingEvent({
    uid: result.uid,
    type: "RETEST_READY" as const,
    tier: result.tier,
    publicName:
      result.athleteName,
  });

  await createParentSignal({
    athleteId: result.uid,
    athleteName:
      result.athleteName,

    type:
      PARENT_SIGNAL_TYPES.RETEST_READY,

    source: "retestAthlete",
    sourceId: result.uid,
  });

  return {
    ok: true,
    uid: result.uid,
    state: "ELIGIBLE",
  };
});