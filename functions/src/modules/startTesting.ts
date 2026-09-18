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
import {
  COACH_STAFF_ROLES,
  requireActiveStaff,
  requireCoachAthleteAccess,
} from "../services/staffAuthorization";

export const startTesting = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const actor = await requireActiveStaff(req.auth.uid, COACH_STAFF_ROLES, "Active Coach access required.");
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
  requireCoachAthleteAccess(actor, athlete);

  await athleteRef.update({
    "testing.state": "TESTING",
    "testing.testingStartedAt":
      FieldValue.serverTimestamp(),
    "testing.lastTestResult": null,
    "testing.freezeUntil": null,
    "testing.cooldownUntil": null,
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
    type: "TEST_STARTED" as const,
    tier: athlete.tier ?? null,
    parentUid,
    publicName: athleteName,
  };

  await createTestingEvent(eventPayload);

  await createParentSignal({
    athleteId: uid,
    athleteName,
    type: PARENT_SIGNAL_TYPES.TEST_STARTED,
    source: "startTesting",
    sourceId: uid,
  });

  return {
    ok: true,
    uid,
  };
});
