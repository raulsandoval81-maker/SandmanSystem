"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistRecognitionAward = persistRecognitionAward;
exports.markStripeCertificateIssuedTransaction = markStripeCertificateIssuedTransaction;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const athleteNormalizer_1 = require("../engines/athlete-engine/athleteNormalizer");
const certificatePayloadEngine_1 = require("../engines/certificate-engine/certificatePayloadEngine");
const staffAuthorization_1 = require("./staffAuthorization");
const awardRecognition_1 = require("../engines/recognition-engine/awardRecognition");
async function persistRecognitionAward(request) {
    if (!request.athleteUid) {
        throw new Error("Missing athleteUid.");
    }
    const db = (0, firestore_1.getFirestore)();
    const athleteRef = db.collection("athletes").doc(request.athleteUid);
    const event = (0, awardRecognition_1.awardRecognition)(request);
    await athleteRef.update({
        recognitionHistory: firestore_1.FieldValue.arrayUnion(event),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    return {
        ok: true,
        athleteUid: request.athleteUid,
        event
    };
}
function requireNonNegativeInteger(value, field) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
        throw new https_1.HttpsError("invalid-argument", `${field} must be a non-negative integer.`);
    }
    return number;
}
async function markStripeCertificateIssuedTransaction(actor, request, db = (0, firestore_1.getFirestore)()) {
    const athleteId = String(request.athleteId ?? "").trim();
    if (!athleteId) {
        throw new https_1.HttpsError("invalid-argument", "A valid athlete ID is required.");
    }
    const expectedTier = requireNonNegativeInteger(request.expectedTier, "expectedTier");
    const expectedStripe = requireNonNegativeInteger(request.expectedStripe, "expectedStripe");
    if (expectedStripe < 1 || expectedStripe > 4) {
        throw new https_1.HttpsError("invalid-argument", "expectedStripe must be between 1 and 4.");
    }
    const athleteRef = db.collection("athletes").doc(athleteId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(athleteRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", `Athlete not found: ${athleteId}`);
        }
        const source = snap.data() || {};
        (0, staffAuthorization_1.requireCoachAthleteAccess)(actor, source);
        const athlete = (0, athleteNormalizer_1.normalizeAthlete)({ ...source, uid: athleteId });
        if ((0, certificatePayloadEngine_1.hasIssuedStripeCertificate)(athlete, expectedTier, expectedStripe)) {
            return {
                ok: true,
                idempotent: true,
                athleteId,
                tier: expectedTier,
                stripe: expectedStripe,
            };
        }
        const payload = (0, certificatePayloadEngine_1.buildCertificatePayload)(athlete);
        if (payload?.printReady !== true ||
            !("tier" in payload) ||
            !("stripe" in payload)) {
            throw new https_1.HttpsError("failed-precondition", payload?.message || "This athlete does not have a stripe certificate ready to issue.");
        }
        const derivedTier = Number(payload.tier);
        const derivedStripe = Number(payload.stripe);
        if (derivedTier !== expectedTier || derivedStripe !== expectedStripe) {
            throw new https_1.HttpsError("failed-precondition", "The certificate changed after it was loaded. Reload and verify the current certificate.");
        }
        const event = (0, awardRecognition_1.awardRecognition)({
            athleteUid: athleteId,
            coachUid: actor.uid,
            type: "STRIPE_AWARD",
            tier: derivedTier,
            stripe: derivedStripe,
        });
        const history = Array.isArray(source.recognitionHistory)
            ? source.recognitionHistory
            : [];
        tx.update(athleteRef, {
            recognitionHistory: [...history, event],
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            ok: true,
            idempotent: false,
            athleteId,
            tier: derivedTier,
            stripe: derivedStripe,
            event,
        };
    });
}
