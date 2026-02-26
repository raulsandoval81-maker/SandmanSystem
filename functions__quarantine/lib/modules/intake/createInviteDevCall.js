"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInviteDevCall = void 0;
// functions/src/modules/intake/createInviteDevCall.ts
const https_1 = require("firebase-functions/v2/https");
const node_crypto_1 = __importDefault(require("node:crypto"));
const admin_1 = require("../../infra/admin");
function isEmulator() {
    return !!(process.env.FUNCTIONS_EMULATOR ||
        process.env.FIREBASE_AUTH_EMULATOR_HOST);
}
function isCoachOrAdmin(token) {
    return !!(token?.coach === true || token?.admin === true);
}
exports.createInviteDevCall = (0, https_1.onCall)(async (req) => {
    const { auth } = req;
    // dev: allow in emulator; prod: require role
    if (!isEmulator() && (!auth || !isCoachOrAdmin(auth.token))) {
        throw new https_1.HttpsError("permission-denied", "Not allowed");
    }
    const token = node_crypto_1.default.randomUUID();
    const expiresAt = Date.now() + 48 * 3600 * 1000;
    await admin_1.db.collection("intakeTokens").doc(token).set({
        exp: expiresAt,
        createdAt: admin_1.FieldValue.serverTimestamp(),
        by: auth?.uid ?? null,
    });
    return {
        ok: true,
        token,
        hintPath: "/silver",
        expiresAt,
    };
});
