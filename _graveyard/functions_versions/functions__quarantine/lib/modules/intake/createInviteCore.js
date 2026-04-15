"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInviteCore = createInviteCore;
// functions/src/modules/intake/createInviteCore.ts
const admin_1 = require("../../infra/admin");
const env_1 = require("../../env");
async function createInviteCore(args) {
    // new token doc
    const tokenRef = admin_1.db.collection("intakes").doc();
    const tokenId = tokenRef.id;
    const base = env_1.PUBLIC_BASE_URL && env_1.PUBLIC_BASE_URL.length > 0
        ? env_1.PUBLIC_BASE_URL
        : "http://localhost:5000";
    // ✅ Intake-proof default: if env is missing, route to real parent intake page
    const path = env_1.PARENT_INTAKE_PATH && String(env_1.PARENT_INTAKE_PATH).trim().length > 0
        ? String(env_1.PARENT_INTAKE_PATH).trim()
        : "/intake-parent/";
    // Invite URL
    const url = `${base}${path}?token=${tokenId}`;
    // 48h expiry using Firestore Timestamp from millis
    const expiresAt = admin_1.Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000);
    await tokenRef.set({
        status: "pending",
        createdAt: admin_1.FieldValue.serverTimestamp(),
        createdBy: args.actorUid,
        mode: args.mode, // "emu" | "prod"
        expiresAt,
    }, { merge: false });
    return { tokenId, url };
}
