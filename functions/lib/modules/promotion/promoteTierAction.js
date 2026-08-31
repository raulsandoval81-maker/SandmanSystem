"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promoteTier = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const progressionCyclePolicy_1 = require("../../policy/progressionCyclePolicy");
const authoritativeXpService_1 = require("../../services/authoritativeXpService");
const createParentSignal_1 = require("../parent/createParentSignal");
const rankMeta_1 = require("./rankMeta");
const createTestingEvent_1 = require("../testing-events/createTestingEvent");
const f8CurriculumCompatibilityPolicy_1 = require("../../policy/f8CurriculumCompatibilityPolicy");
function normalizeProgramKind(a) {
    const raw = String(a?.programKind || a?.trackCode || a?.track || a?.program || "").toLowerCase();
    if (/zero|z2h|youth|foundry8/.test(raw))
        return "youth";
    if (/submission/.test(raw))
        return "submission-grappling";
    if (/boxing/.test(raw))
        return "boxing";
    if (/kickboxing/.test(raw))
        return "kickboxing";
    if (/mma|quest/.test(raw))
        return "mma";
    return "wrestling";
}
exports.promoteTier = (0, https_1.onCall)(async (req) => {
    const uid = String(req.data?.uid ?? "").trim();
    const note = String(req.data?.note ?? "").trim();
    if (!uid)
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    const db = (0, firestore_1.getFirestore)();
    const athleteRef = db.doc(`athletes/${uid}`);
    const logRef = db.collection("xp_logs").doc();
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(athleteRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", `Athlete not found: ${uid}`);
        const athlete = snap.data() || {};
        const classified = (0, authoritativeXpService_1.classifyAthlete)(athlete, uid);
        if (classified === "ADULT")
            throw new https_1.HttpsError("failed-precondition", "Unsupported promotion program");
        const base = classified;
        const tier = base === "F8" ? (0, f8CurriculumCompatibilityPolicy_1.resolveF8ProgressionTier)(athlete) : (0, authoritativeXpService_1.athleteTier)(athlete, base);
        const curriculumTier = base === "F8" ? (0, f8CurriculumCompatibilityPolicy_1.resolveF8CurriculumTier)(athlete) : null;
        const currentCycle = (0, progressionCyclePolicy_1.progressionCycleSnapshot)(athlete, tier);
        const transition = (0, progressionCyclePolicy_1.resolvePromotionTransition)(base, tier);
        const testing = athlete.testing || {};
        if (String(testing.lastTestResult ?? "").toUpperCase() !== "PASS") {
            throw new https_1.HttpsError("failed-precondition", "COMPLETED_PASS_REQUIRED");
        }
        if (String(testing.passedTier ?? tier).toUpperCase() !== tier) {
            throw new https_1.HttpsError("failed-precondition", "PASS_DOES_NOT_MATCH_ACTIVE_TIER");
        }
        if (String(testing.passedCycleId ?? currentCycle.id) !== currentCycle.id) {
            throw new https_1.HttpsError("failed-precondition", "PASS_DOES_NOT_MATCH_ACTIVE_CYCLE");
        }
        if (!(0, progressionCyclePolicy_1.isPromotionCooldownComplete)(testing, Date.now())) {
            throw new https_1.HttpsError("failed-precondition", "PROMOTION_COOLDOWN_NOT_COMPLETE");
        }
        const programKind = normalizeProgramKind(athlete);
        const nextCycle = (0, progressionCyclePolicy_1.nextProgressionCycle)(athlete, transition.next.tier, logRef.id);
        const rankMeta = rankMeta_1.RANK_META[programKind]?.[base]?.[transition.next.tier];
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
                curriculumVersion: f8CurriculumCompatibilityPolicy_1.F8_CURRICULUM_COMPATIBILITY_VERSION,
            } : {}),
            rankName,
            rankColor: rankMeta?.rankColor || "",
            xp: 0,
            xpCap: transition.next.xpCap,
            stripeCount: 0,
            trackBase: base,
            programKind,
            progressionCycle: { ...nextCycle, startedAt: firestore_1.FieldValue.serverTimestamp() },
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
            "testing.promotedAt": firestore_1.FieldValue.serverTimestamp(),
            "testing.lastPromotion": {
                fromTier: tier, toTier: transition.next.tier,
                fromCycleId: currentCycle.id, toCycleId: nextCycle.id,
                score: promotionResult.score, result: promotionResult,
                promotedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const history = {
            uid, base, programKind, fromTier: tier, toTier: transition.next.tier,
            fromCycleId: currentCycle.id, toCycleId: nextCycle.id,
            beforeXp: promotionResult.beforeXp, afterXp: 0,
            beforeStripeCount: promotionResult.beforeStripeCount, afterStripeCount: 0,
            previousXpCap: Number(athlete.xpCap ?? transition.current.xpCap),
            nextXpCap: transition.next.xpCap, score: promotionResult.score,
            note: note || `Promoted ${tier} to ${transition.next.tier} after completed cooldown`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        tx.set(logRef, { kind: "PROMOTION", amount: 0, tier: transition.next.tier, ...history });
        tx.create(db.doc(`athletes/${uid}/promotionHistory/${logRef.id}`), history);
        return promotionResult;
    });
    await (0, createTestingEvent_1.createTestingEvent)({
        uid: result.uid, type: "PROMOTED", score: result.score,
        tier: result.fromTier, nextTier: result.toTier,
        parentUid: result.parentUid, publicName: result.publicName,
    });
    await (0, createParentSignal_1.createParentSignal)({
        athleteId: result.uid, athleteName: result.publicName,
        type: createParentSignal_1.PARENT_SIGNAL_TYPES.PROMOTED, nextTier: result.toTier,
        source: "promoteTier", sourceId: result.logId,
    });
    return result;
});
