"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvite = void 0;
exports.createInviteCore = createInviteCore;
// functions/src/modules/intake/createInvite.ts
const https_1 = require("firebase-functions/v2/https");
const uuid_1 = require("uuid");
const env_1 = require("../../env");
const logAdmin_1 = require("../../infra/logAdmin");
const admin_1 = require("../../infra/admin");
async function createInviteCore(opts) {
    const actorUid = opts.auth?.uid ?? null;
    const claims = (opts.auth?.token ?? {});
    // keep your existing gate: prod requires admin, emu allows
    if (!env_1.IS_EMULATOR && !claims.admin) {
        throw new Error("Admin only.");
    }
    const tokenId = (0, uuid_1.v4)().slice(0, 8);
    const expiresAtMillis = Date.now() + 48 * 60 * 60 * 1000;
    await admin_1.db.collection("intakes").doc(tokenId).set({
        status: "invited",
        createdAt: admin_1.FieldValue.serverTimestamp(),
        expiresAt: admin_1.Timestamp.fromMillis(expiresAtMillis),
        createdBy: actorUid,
        mode: env_1.IS_EMULATOR ? "emu" : "prod",
    }, { merge: true });
    const base = env_1.PUBLIC_BASE_URL?.length ? env_1.PUBLIC_BASE_URL : "http://localhost:5000";
    const path = env_1.PARENT_INTAKE_PATH ?? "/intake-parent/";
    const url = `${base}${path}?token=${tokenId}`;
    try {
        await (0, logAdmin_1.logIntakeInvite)({
            actorUid,
            token: tokenId,
            url,
            expiresAt: expiresAtMillis,
            createdAtMillis: Date.now(),
        });
    }
    catch (e) {
        console.error("[createInvite] log failed:", e);
    }
    return { ok: true, tokenId, url, expiresAt: expiresAtMillis };
}
// v2 callable
exports.createInvite = (0, https_1.onCall)(async (request) => {
    const auth = request.auth;
    return createInviteCore({
        auth: {
            uid: auth?.uid ?? null,
            token: auth?.token ?? null,
        },
    });
});
