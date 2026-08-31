"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passAthleteTest = void 0;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const authoritativeXpService_1 = require("../services/authoritativeXpService");
const createTestingEvent_1 = require("./testing-events/createTestingEvent");
const createParentSignal_1 = require("./parent/createParentSignal");
const PASSING_SCORE = 85;
const COOLDOWN_DAYS = 5;
exports.passAthleteTest = (0, https_1.onCall)(async (req) => {
    const uid = String(req.data?.uid ?? "").trim();
    const score = Number(req.data?.score);
    if (!uid)
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    if (!Number.isFinite(score) || score < PASSING_SCORE || score > 100) {
        throw new https_1.HttpsError("failed-precondition", "Passing score must be from 85 through 100");
    }
    const db = (0, firestore_1.getFirestore)();
    const athleteRef = db.doc(`athletes/${uid}`);
    const result = await db.runTransaction(async (tx) => {
        const athleteSnap = await tx.get(athleteRef);
        if (!athleteSnap.exists)
            throw new https_1.HttpsError("not-found", `Athlete not found: ${uid}`);
        const athlete = athleteSnap.data() || {};
        const base = (0, authoritativeXpService_1.classifyAthlete)(athlete, uid);
        if (base === "ADULT")
            throw new https_1.HttpsError("failed-precondition", "Unsupported promotion program");
        const tier = (0, authoritativeXpService_1.athleteTier)(athlete, base);
        const cycleId = String(athlete?.progressionCycle?.id ?? "").trim() || `legacy:${tier}`;
        const receiptId = (0, node_crypto_1.createHash)("sha256").update(`${uid}|${cycleId}|PASS`).digest("hex").slice(0, 32);
        const passReceiptRef = db.doc(`athletes/${uid}/testingActionReceipts/${receiptId}`);
        const receiptSnap = await tx.get(passReceiptRef);
        if (receiptSnap.exists && receiptSnap.data()?.cycleId === cycleId) {
            return { ...(receiptSnap.data()?.result || {}), ok: true, idempotent: true };
        }
        if (String(athlete?.testing?.state ?? "").toUpperCase() !== "TESTING") {
            throw new https_1.HttpsError("failed-precondition", "Athlete must be TESTING before PASS");
        }
        const cap = (0, authoritativeXpService_1.activeXpCap)(athlete, base);
        const xp = Number(athlete.xp ?? 0);
        if (!Number.isFinite(xp) || xp < cap) {
            throw new https_1.HttpsError("failed-precondition", "ACTIVE_RANK_XP_REQUIREMENT_NOT_REACHED");
        }
        const cooldownUntil = firestore_1.Timestamp.fromMillis(Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
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
            "testing.passedAt": firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(passReceiptRef, {
            uid, tier, cycleId, score, result: passResult,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return passResult;
    });
    if (!result.idempotent) {
        await (0, createTestingEvent_1.createTestingEvent)({
            uid: result.uid, type: "TEST_PASSED", score: result.score,
            tier: result.tier, parentUid: result.parentUid, publicName: result.publicName,
        });
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: result.uid, athleteName: result.publicName,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_PASSED, source: "passAthleteTest",
            sourceId: `${result.uid}:${result.cycleId}`,
        });
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: result.uid, athleteName: result.publicName,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.COOLDOWN_STARTED, source: "passAthleteTest",
            sourceId: `${result.uid}:${result.cycleId}`,
        });
    }
    return result;
});
