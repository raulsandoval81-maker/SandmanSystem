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
exports.testAthleteXp = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
exports.testAthleteXp = (0, https_1.onRequest)(async (req, res) => {
    const db = admin.firestore();
    const athleteId = "F4-TEST-0001";
    const delta = 5;
    const ref = db.doc(`athletes/${athleteId}`);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const beforeXp = (snap.exists ? (snap.data()?.xp ?? 0) : 0);
        const afterXp = beforeXp + delta;
        // 1) update athlete xp (exact number, no increment)
        tx.set(ref, {
            xp: afterXp,
            lastXpTest: new Date().toISOString(),
        }, { merge: true });
        // 2) write an immutable log row (auto-id)
        const logRef = db.collection("xp_logs").doc();
        tx.set(logRef, {
            athleteId,
            delta,
            beforeXp,
            afterXp,
            source: "TEST",
            ts: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    res.json({
        ok: true,
        athleteId,
        delta,
    });
});
