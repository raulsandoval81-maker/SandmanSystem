import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { createTestingEvent } from "./testing-events/createTestingEvent";
import { writeParentTestingPing } from "./testing-events/writeParentTestingPing";

export const scheduleTesting = onCall(async (req) => {
  const db = getFirestore();

  const uid = String(req.data?.uid || "").trim();
  const scheduledDate = String(req.data?.scheduledDate || "").trim();

  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid");
  }

  if (!scheduledDate) {
    throw new HttpsError("invalid-argument", "Missing scheduledDate");
  }

  const athleteRef = db.collection("athletes").doc(uid);
  const snap = await athleteRef.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Athlete not found");
  }

  const athlete = snap.data() || {};

  await athleteRef.update({
    "testing.state": "READY",
    "testing.preReadyState": athlete?.testing?.state || null,
    "testing.coachReady": true,
    "testing.scheduledDate": scheduledDate,
    "testing.scheduledAt": FieldValue.serverTimestamp(),
    "testing.coachReadyAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const eventPayload = {
    uid,
    type: "TEST_SCHEDULED" as const,
    tier: athlete.tier ?? null,
    parentUid: athlete.parentUid ?? null,
    publicName: athlete.publicName ?? athlete.fullName ?? null,
    scheduledDate,
  };

  await createTestingEvent(eventPayload);
  await writeParentTestingPing(eventPayload);

  return {
    ok: true,
    uid,
    scheduledDate,
  };
});