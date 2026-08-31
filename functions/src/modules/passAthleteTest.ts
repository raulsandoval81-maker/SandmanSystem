import { createHash } from "node:crypto";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { activeXpCap, athleteTier, classifyAthlete } from "../services/authoritativeXpService";
import { createTestingEvent } from "./testing-events/createTestingEvent";
import { createParentSignal, PARENT_SIGNAL_TYPES } from "./parent/createParentSignal";

const PASSING_SCORE = 85;
const COOLDOWN_DAYS = 5;

export const passAthleteTest = onCall(async (req) => {
  const uid = String(req.data?.uid ?? "").trim();
  const score = Number(req.data?.score);
  if (!uid) throw new HttpsError("invalid-argument", "Missing uid");
  if (!Number.isFinite(score) || score < PASSING_SCORE || score > 100) {
    throw new HttpsError("failed-precondition", "Passing score must be from 85 through 100");
  }

  const db = getFirestore();
  const athleteRef = db.doc(`athletes/${uid}`);
  const result = await db.runTransaction(async (tx) => {
    const athleteSnap = await tx.get(athleteRef);
    if (!athleteSnap.exists) throw new HttpsError("not-found", `Athlete not found: ${uid}`);
    const athlete = athleteSnap.data() || {};
    const base = classifyAthlete(athlete, uid);
    if (base === "ADULT") throw new HttpsError("failed-precondition", "Unsupported promotion program");
    const tier = athleteTier(athlete);
    const cycleId = String(athlete?.progressionCycle?.id ?? "").trim() || `legacy:${tier}`;
    const receiptId = createHash("sha256").update(`${uid}|${cycleId}|PASS`).digest("hex").slice(0, 32);
    const passReceiptRef = db.doc(`athletes/${uid}/testingActionReceipts/${receiptId}`);
    const receiptSnap = await tx.get(passReceiptRef);

    if (receiptSnap.exists && receiptSnap.data()?.cycleId === cycleId) {
      return { ...(receiptSnap.data()?.result || {}), ok: true, idempotent: true };
    }
    if (String(athlete?.testing?.state ?? "").toUpperCase() !== "TESTING") {
      throw new HttpsError("failed-precondition", "Athlete must be TESTING before PASS");
    }
    const cap = activeXpCap(athlete, base);
    const xp = Number(athlete.xp ?? 0);
    if (!Number.isFinite(xp) || xp < cap) {
      throw new HttpsError("failed-precondition", "ACTIVE_RANK_XP_REQUIREMENT_NOT_REACHED");
    }

    const cooldownUntil = Timestamp.fromMillis(
      Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    );
    const passResult = {
      ok: true, idempotent: false, uid, score, tier, base, cycleId,
      cooldownUntil: cooldownUntil.toDate().toISOString(),
      parentUid: athlete.parentUid ?? null,
      publicName: athlete.publicName ?? athlete.fullName ?? uid,
    };
    tx.update(athleteRef, {
      tierStatus: "cooldown",
      promotionLocked: true,
      "testing.state": "COOLDOWN",
      "testing.lastTestResult": "PASS",
      "testing.lastTestScore": score,
      "testing.passingScore": PASSING_SCORE,
      "testing.cooldownUntil": cooldownUntil,
      "testing.freezeUntil": null,
      "testing.testingStartedAt": null,
      "testing.coachReady": false,
      "testing.coachReadyAt": null,
      "testing.scheduledDate": null,
      "testing.scheduledAt": null,
      "testing.scheduledBy": null,
      "testing.passedTier": tier,
      "testing.passedCycleId": cycleId,
      "testing.passedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(passReceiptRef, {
      uid, tier, cycleId, score, result: passResult,
      createdAt: FieldValue.serverTimestamp(),
    });
    return passResult;
  });

  if (!result.idempotent) {
    await createTestingEvent({
      uid: result.uid, type: "TEST_PASSED", score: result.score,
      tier: result.tier, parentUid: result.parentUid, publicName: result.publicName,
    });
    await createParentSignal({
      athleteId: result.uid, athleteName: result.publicName,
      type: PARENT_SIGNAL_TYPES.TEST_PASSED, source: "passAthleteTest",
      sourceId: `${result.uid}:${result.cycleId}`,
    });
    await createParentSignal({
      athleteId: result.uid, athleteName: result.publicName,
      type: PARENT_SIGNAL_TYPES.COOLDOWN_STARTED, source: "passAthleteTest",
      sourceId: `${result.uid}:${result.cycleId}`,
    });
  }
  return result;
});
