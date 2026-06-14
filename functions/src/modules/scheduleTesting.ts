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

export const scheduleTesting = onCall(async (req) => {
  const db = getFirestore();

  const uid =
    String(req.data?.uid || "").trim();

  const scheduledDate =
    String(req.data?.scheduledDate || "").trim();

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "Missing uid"
    );
  }

  if (!scheduledDate) {
    throw new HttpsError(
      "invalid-argument",
      "Missing scheduledDate"
    );
  }

  const athleteRef =
    db.collection("athletes").doc(uid);

  const snap =
    await athleteRef.get();

  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "Athlete not found"
    );
  }

  const athlete =
    snap.data() || {};

  await athleteRef.update({
    "testing.state": "READY",
    "testing.preReadyState":
      athlete?.testing?.state || null,
    "testing.coachReady": true,
    "testing.scheduledDate": scheduledDate,
    "testing.scheduledAt":
      FieldValue.serverTimestamp(),
    "testing.coachReadyAt":
      FieldValue.serverTimestamp(),
    updatedAt:
      FieldValue.serverTimestamp(),
  });

  const athleteName =
    athlete.publicName ||
    athlete.fullName ||
    uid;

  const parentUid =
    athlete.parentUid || null;

  const eventPayload = {
    uid,
    type: "TEST_SCHEDULED" as const,
    tier: athlete.tier ?? null,
    parentUid,
    publicName: athleteName,
    scheduledDate,
  };

  await createTestingEvent(eventPayload);

  await createParentSignal({
    athleteId: uid,
    athleteName,
    type: PARENT_SIGNAL_TYPES.TEST_SCHEDULED,
    testingDate: scheduledDate,
    source: "scheduleTesting",
    sourceId: uid,
  });

  return {
    ok: true,
    uid,
    scheduledDate,
  };
});