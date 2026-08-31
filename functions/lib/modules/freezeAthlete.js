"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freezeAthlete = void 0;
exports.freezeAthleteAuthoritatively = freezeAthleteAuthoritatively;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const node_crypto_1 = require("node:crypto");
const createTestingEvent_1 = require("./testing-events/createTestingEvent");
const createParentSignal_1 = require("./parent/createParentSignal");
async function freezeAthleteAuthoritatively(uidInput, scoreInput, actionIdentity = "") {
    const db = (0, firestore_1.getFirestore)();
    const uid = String(uidInput || "").trim();
    const score = Number(scoreInput);
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    }
    if (!Number.isFinite(score) ||
        score < 0 ||
        score > 100) {
        throw new https_1.HttpsError("invalid-argument", "Invalid score");
    }
    if (score >= 85) {
        throw new https_1.HttpsError("failed-precondition", "Score is 85 or higher. Use Pass Test.");
    }
    const athleteRef = db.collection("athletes").doc(uid);
    const freezeUntil = new Date();
    freezeUntil.setDate(freezeUntil.getDate() + 5);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(athleteRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", `Athlete not found: ${uid}`);
        }
        const athlete = snap.data() || {};
        const receiptRef = actionIdentity
            ? db.doc(`athletes/${uid}/testingActionReceipts/${(0, node_crypto_1.createHash)("sha256")
                .update(`${uid}|FAIL|${actionIdentity}`).digest("hex").slice(0, 32)}`)
            : null;
        if (receiptRef) {
            const receiptSnap = await tx.get(receiptRef);
            if (receiptSnap.exists) {
                return { ...(receiptSnap.data()?.result || {}), ok: true, idempotent: true };
            }
        }
        const testingState = String(athlete?.testing?.state || "");
        if (testingState !== "TESTING") {
            throw new https_1.HttpsError("failed-precondition", `Athlete must be TESTING before freeze. Current state: ${testingState}`);
        }
        const freezeResult = {
            ok: true,
            idempotent: false,
            uid,
            score,
            state: "FREEZE",
            freezeUntil: freezeUntil.toISOString(),
            tier: athlete.tier ?? null,
            parentUid: athlete.parentUid ?? null,
            publicName: athlete.publicName ?? athlete.fullName ?? uid,
        };
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (receiptRef)
            tx.create(receiptRef, {
                uid, actionIdentity, score, result: freezeResult,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        return freezeResult;
    });
    if (result.ok && !result.idempotent) {
        const eventPayload = {
            uid: result.uid,
            type: "TEST_FAILED",
            score: result.score,
            tier: result.tier,
            parentUid: result.parentUid,
            publicName: result.publicName,
        };
        await (0, createTestingEvent_1.createTestingEvent)(eventPayload);
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: result.uid,
            athleteName: result.publicName,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_FAILED,
            source: "freezeAthlete",
            sourceId: result.uid,
        });
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: result.uid,
            athleteName: result.publicName,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_FREEZE,
            source: "freezeAthlete",
            sourceId: result.uid,
        });
    }
    return result;
}
exports.freezeAthlete = (0, https_1.onCall)(async (req) => freezeAthleteAuthoritatively(req.data?.uid, req.data?.score));
