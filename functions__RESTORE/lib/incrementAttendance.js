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
exports.incrementAttendance = exports.incrementAttendanceHttp = void 0;
// functions/src/incrementAttendance.ts
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.incrementAttendanceHttp = (0, https_1.onRequest)(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "POST only" });
        return;
    }
    const raw = req.body && req.body.data ? req.body.data : req.body || {};
    const uid = (raw.uid ||
        raw.athleteId ||
        raw.id ||
        "").toString().trim();
    if (!uid) {
        res.status(200).json({
            ok: false,
            error: "uid (or athleteId) required",
            got: raw,
        });
        return;
    }
    try {
        const now = new Date();
        const athRef = db.collection("athletes").doc(uid);
        await db.runTransaction(async (tx) => {
            var _a;
            const snap = await tx.get(athRef);
            const prev = snap.exists ? Number(((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.xp) || 0) : 0;
            const next = prev + 10;
            tx.set(athRef, {
                xp: next,
                updatedAt: now,
            }, { merge: true });
        });
        await db.collection("xpLogs").add({
            athleteUid: uid,
            event: "attendance",
            delta: 10,
            source: "incrementAttendanceHttp",
            createdAt: now,
        });
        res.status(200).json({ ok: true, uid, delta: 10, event: "attendance" });
    }
    catch (err) {
        console.error("[incrementAttendanceHttp] crash:", err);
        res.status(200).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || "server error" });
    }
});
const incrementAttendance = async (data) => {
    var _a;
    const uid = (_a = data === null || data === void 0 ? void 0 : data.uid) === null || _a === void 0 ? void 0 : _a.trim();
    if (!uid)
        throw new Error("uid required");
    const now = new Date();
    const athRef = db.collection("athletes").doc(uid);
    await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(athRef);
        const prev = snap.exists ? Number(((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.xp) || 0) : 0;
        const next = prev + 10;
        tx.set(athRef, {
            xp: next,
            updatedAt: now,
        }, { merge: true });
    });
    await db.collection("xpLogs").add({
        athleteUid: uid,
        event: "attendance",
        delta: 10,
        source: "incrementAttendanceCallable",
        createdAt: now,
    });
    return { ok: true, uid, delta: 10, event: "attendance" };
};
exports.incrementAttendance = incrementAttendance;
