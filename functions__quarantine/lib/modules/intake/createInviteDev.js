"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInviteDev = void 0;
// functions/src/modules/intake/createInviteDev.ts
const https_1 = require("firebase-functions/v2/https");
const uuid_1 = require("uuid");
const admin_1 = require("../../infra/admin");
exports.createInviteDev = (0, https_1.onCall)(async (request) => {
    // emulator-only guard (simple + strict)
    const isEmu = process.env.FUNCTIONS_EMULATOR === "true" ||
        !!process.env.FIRESTORE_EMULATOR_HOST ||
        !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (!isEmu)
        throw new Error("Emulator only.");
    const actorUid = request.auth?.uid ?? null;
    const tokenId = (0, uuid_1.v4)().slice(0, 8);
    const expiresAtMillis = Date.now() + 48 * 60 * 60 * 1000;
    await admin_1.db.collection("intakes").doc(tokenId).set({
        status: "invited",
        createdAt: admin_1.FieldValue.serverTimestamp(),
        expiresAt: admin_1.Timestamp.fromMillis(expiresAtMillis),
        createdBy: actorUid,
        mode: "emu",
    }, { merge: true });
    // local dev url (fine for dev callable)
    const url = `http://localhost:5000/intake-parent/?token=${tokenId}`;
    return { ok: true, tokenId, url, expiresAt: expiresAtMillis };
});
