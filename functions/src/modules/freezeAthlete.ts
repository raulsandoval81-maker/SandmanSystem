import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { createTestingEvent } from "./testing-events/createTestingEvent";
import { writeParentTestingPing } from "./testing-events/writeParentTestingPing";

export const freezeAthlete = onCall(async (req) => {
  const db = getFirestore();

  const payload = req.data || {};
  const uid = String(payload.uid || "").trim();
  const score = Number(payload.score || 0);

  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid");
  }

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new HttpsError("invalid-argument", "Invalid score");
  }

  if (score >= 85) {
    throw new HttpsError(
      "failed-precondition",
      "Score is 85 or higher. Use Pass Test."
    );
  }

  const athleteRef = db.collection("athletes").doc(uid);

  console.log("FREEZE STEP 1", uid);

  const freezeUntil = new Date();
  freezeUntil.setDate(freezeUntil.getDate() + 5);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);

    if (!snap.exists) {
      throw new HttpsError("not-found", `Athlete not found: ${uid}`);
    }

    const athlete = snap.data() || {};
    const testingState = String(athlete?.testing?.state || "");

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

      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      uid,
      score,
      state: "FREEZE",
      freezeUntil: freezeUntil.toISOString(),

      tier: athlete.tier ?? null,
      parentUid: athlete.parentUid ?? null,
      publicName: athlete.publicName ?? athlete.fullName ?? null,
    };
  });

  console.log("FREEZE STEP 2", result);

  if (result.ok) {
    const eventPayload = {
      uid: result.uid,
      type: "TEST_FAILED" as const,
      score: result.score,
      tier: result.tier,
      parentUid: result.parentUid,
      publicName: result.publicName,
    };

    console.log("FREEZE EVENT FINAL PAYLOAD", eventPayload);

    await createTestingEvent(eventPayload);
    console.log("FREEZE STEP 3 EVENT WRITTEN");

    await writeParentTestingPing(eventPayload);
    console.log("FREEZE STEP 4 PARENT WRITTEN");
  }

  return result;
});