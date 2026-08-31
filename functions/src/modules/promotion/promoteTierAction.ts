import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  isPromotionCooldownComplete,
  nextProgressionCycle,
  progressionCycleSnapshot,
  resolvePromotionTransition,
} from "../../policy/progressionCyclePolicy";
import { athleteTier, classifyAthlete } from "../../services/authoritativeXpService";
import { createParentSignal, PARENT_SIGNAL_TYPES } from "../parent/createParentSignal";
import { RANK_META, type Base, type ProgramKind } from "./rankMeta";
import { createTestingEvent } from "../testing-events/createTestingEvent";
import {
  F8_CURRICULUM_COMPATIBILITY_VERSION,
  resolveF8CurriculumTier,
  resolveF8ProgressionTier,
} from "../../policy/f8CurriculumCompatibilityPolicy";

function normalizeProgramKind(a: any): ProgramKind {
  const raw = String(a?.programKind || a?.trackCode || a?.track || a?.program || "").toLowerCase();
  if (/zero|z2h|youth|foundry8/.test(raw)) return "youth";
  if (/submission/.test(raw)) return "submission-grappling";
  if (/boxing/.test(raw)) return "boxing";
  if (/kickboxing/.test(raw)) return "kickboxing";
  if (/mma|quest/.test(raw)) return "mma";
  return "wrestling";
}

export const promoteTier = onCall(async (req) => {
  const uid = String(req.data?.uid ?? "").trim();
  const note = String(req.data?.note ?? "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "Missing uid");

  const db = getFirestore();
  const athleteRef = db.doc(`athletes/${uid}`);
  const logRef = db.collection("xp_logs").doc();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);
    if (!snap.exists) throw new HttpsError("not-found", `Athlete not found: ${uid}`);
    const athlete = snap.data() || {};
    const classified = classifyAthlete(athlete, uid);
    if (classified === "ADULT") throw new HttpsError("failed-precondition", "Unsupported promotion program");
    const base = classified as Base;
    const tier = base === "F8" ? resolveF8ProgressionTier(athlete) : athleteTier(athlete, base);
    const curriculumTier = base === "F8" ? resolveF8CurriculumTier(athlete) : null;
    const currentCycle = progressionCycleSnapshot(athlete, tier);
    const transition = resolvePromotionTransition(base, tier);
    const testing = athlete.testing || {};
    if (String(testing.lastTestResult ?? "").toUpperCase() !== "PASS") {
      throw new HttpsError("failed-precondition", "COMPLETED_PASS_REQUIRED");
    }
    if (String(testing.passedTier ?? tier).toUpperCase() !== tier) {
      throw new HttpsError("failed-precondition", "PASS_DOES_NOT_MATCH_ACTIVE_TIER");
    }
    if (String(testing.passedCycleId ?? currentCycle.id) !== currentCycle.id) {
      throw new HttpsError("failed-precondition", "PASS_DOES_NOT_MATCH_ACTIVE_CYCLE");
    }
    if (!isPromotionCooldownComplete(testing, Date.now())) {
      throw new HttpsError("failed-precondition", "PROMOTION_COOLDOWN_NOT_COMPLETE");
    }

    const programKind = normalizeProgramKind(athlete);
    const nextCycle = nextProgressionCycle(athlete, transition.next.tier, logRef.id);
    const rankMeta = RANK_META[programKind]?.[base]?.[transition.next.tier];
    const rankName = base === "F8" ? transition.next.rankName
      : rankMeta?.rankName || transition.next.rankName;
    const promotionResult = {
      ok: true, idempotent: false, uid, base, programKind,
      fromTier: tier, toTier: transition.next.tier,
      beforeXp: Number(athlete.xp ?? 0), afterXp: 0,
      beforeStripeCount: Number(athlete.stripeCount ?? 0), afterStripeCount: 0,
      cap: transition.next.xpCap, fromCycleId: currentCycle.id,
      toCycleId: nextCycle.id, score: Number(testing.lastTestScore ?? 0),
      logId: logRef.id, parentUid: athlete.parentUid ?? null,
      publicName: athlete.publicName ?? athlete.fullName ?? uid,
    };

    tx.update(athleteRef, {
      tier: transition.next.tier,
      ...(base === "F8" ? {
        progressionTier: transition.next.tier,
        curriculumTier,
        curriculumVersion: F8_CURRICULUM_COMPATIBILITY_VERSION,
      } : {}),
      rankName,
      rankColor: rankMeta?.rankColor || "",
      xp: 0,
      xpCap: transition.next.xpCap,
      stripeCount: 0,
      trackBase: base,
      programKind,
      progressionCycle: { ...nextCycle, startedAt: FieldValue.serverTimestamp() },
      tierStatus: "active",
      promotionLocked: false,
      "testing.state": "ACTIVE",
      "testing.lastTestResult": null,
      "testing.lastTestScore": null,
      "testing.cooldownUntil": null,
      "testing.freezeUntil": null,
      "testing.testingStartedAt": null,
      "testing.coachReady": false,
      "testing.coachReadyAt": null,
      "testing.scheduledDate": null,
      "testing.scheduledAt": null,
      "testing.scheduledBy": null,
      "testing.passedTier": null,
      "testing.passedCycleId": null,
      "testing.promotedFrom": tier,
      "testing.promotedTo": transition.next.tier,
      "testing.promotedAt": FieldValue.serverTimestamp(),
      "testing.lastPromotion": {
        fromTier: tier, toTier: transition.next.tier,
        fromCycleId: currentCycle.id, toCycleId: nextCycle.id,
        score: promotionResult.score, result: promotionResult,
        promotedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    const history = {
      uid, base, programKind, fromTier: tier, toTier: transition.next.tier,
      fromCycleId: currentCycle.id, toCycleId: nextCycle.id,
      beforeXp: promotionResult.beforeXp, afterXp: 0,
      beforeStripeCount: promotionResult.beforeStripeCount, afterStripeCount: 0,
      previousXpCap: Number(athlete.xpCap ?? transition.current.xpCap),
      nextXpCap: transition.next.xpCap, score: promotionResult.score,
      note: note || `Promoted ${tier} to ${transition.next.tier} after completed cooldown`,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(logRef, { kind: "PROMOTION", amount: 0, tier: transition.next.tier, ...history });
    tx.create(db.doc(`athletes/${uid}/promotionHistory/${logRef.id}`), history);
    return promotionResult;
  });

  await createTestingEvent({
    uid: result.uid, type: "PROMOTED", score: result.score,
    tier: result.fromTier, nextTier: result.toTier,
    parentUid: result.parentUid, publicName: result.publicName,
  });
  await createParentSignal({
    athleteId: result.uid, athleteName: result.publicName,
    type: PARENT_SIGNAL_TYPES.PROMOTED, nextTier: result.toTier,
    source: "promoteTier", sourceId: result.logId,
  });
  return result;
});
