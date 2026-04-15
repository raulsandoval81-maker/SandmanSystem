"use strict";
// functions/src/modules/waiver/saveWaiver.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveWaiver = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const env_1 = require("../env");
// Firestore ref
const db = (0, firestore_1.getFirestore)();
/**
 * saveWaiver – records a waiver acknowledgment.
 * Parent stage: { intakeId }
 * Post-approval: { uid }
 */
exports.saveWaiver = (0, https_1.onCall)(async (request) => {
    const ctx = request.auth;
    const data = request.data || {};
    if (!ctx) {
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    }
    const { uid, intakeId } = data;
    if (!uid && !intakeId) {
        throw new https_1.HttpsError("invalid-argument", "Provide uid (post-approval) or intakeId (parent stage).");
    }
    // Stable docId helps avoid duplicates when tapped twice
    const baseId = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const docId = (data.docId || baseId) + (uid ? "-uid" : "-intake");
    // Choose path
    const basePath = uid
        ? `waivers/${uid}/files`
        : `waiversByIntake/${intakeId}/files`;
    // Emulator: Record placeholder only
    const payload = {
        placeholder: env_1.IS_EMULATOR,
        filePath: env_1.IS_EMULATOR
            ? null
            : `${uid ? `waivers/${uid}` : `waiversByIntake/${intakeId}`}/${docId}.pdf`,
        brand: "Sandman System™ · Sandman Combat™",
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        linkIntake: intakeId || null,
        linkUid: uid || null,
    };
    await db.doc(`${basePath}/${docId}`).set(payload, { merge: true });
    return {
        ok: true,
        stored: !env_1.IS_EMULATOR,
        deferred: env_1.IS_EMULATOR,
        path: `${basePath}/${docId}`,
    };
});
