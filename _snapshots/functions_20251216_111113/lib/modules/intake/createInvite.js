"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvite = void 0;
exports.createInviteCore = createInviteCore;
// functions/src/modules/intake/createInvite.ts
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const uuid_1 = require("uuid");
const env_1 = require("../../env");
const logAdmin_1 = require("../../infra/logAdmin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
async function createInviteCore(opts) {
    var _a, _b, _c, _d;
    const actorUid = (_b = (_a = opts.auth) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : null;
    const claims = ((_d = (_c = opts.auth) === null || _c === void 0 ? void 0 : _c.token) !== null && _d !== void 0 ? _d : {});
    if (!env_1.IS_EMULATOR && !claims.admin) {
        throw new Error("Admin only.");
    }
    const tokenId = (0, uuid_1.v4)().slice(0, 8);
    const expiresAtMillis = Date.now() + 48 * 60 * 60 * 1000;
    await db.collection("intakes").doc(tokenId).set({
        status: "invited",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMillis),
        createdBy: actorUid,
        mode: env_1.IS_EMULATOR ? "emu" : "prod",
    }, { merge: true });
    const base = (env_1.PUBLIC_BASE_URL === null || env_1.PUBLIC_BASE_URL === void 0 ? void 0 : env_1.PUBLIC_BASE_URL.length)
        ? env_1.PUBLIC_BASE_URL
        : "http://localhost:5000";
    const path = env_1.PARENT_INTAKE_PATH !== null && env_1.PARENT_INTAKE_PATH !== void 0 ? env_1.PARENT_INTAKE_PATH : "/intake-parent/";
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
    var _a, _b;
    // v2: auth is on request.auth
    const auth = request.auth;
    return createInviteCore({
        auth: {
            uid: (_a = auth === null || auth === void 0 ? void 0 : auth.uid) !== null && _a !== void 0 ? _a : null,
            token: (_b = auth === null || auth === void 0 ? void 0 : auth.token) !== null && _b !== void 0 ? _b : null,
        },
    });
});
