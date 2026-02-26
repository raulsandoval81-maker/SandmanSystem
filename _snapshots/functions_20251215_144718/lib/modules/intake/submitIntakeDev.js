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
exports.submitIntakeDev = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const env_1 = require("../../env");
exports.submitIntakeDev = functions.https.onRequest(async (req, res) => {
    // CORS for browser
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (!env_1.IS_EMULATOR) {
        res.status(403).json({ ok: false, error: "disabled_outside_emulator" });
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "method_not_allowed" });
        return;
    }
    try {
        const { intakeId, form } = (req.body || {});
        if (!intakeId || typeof intakeId !== "string") {
            res.status(400).json({ ok: false, error: "missing_intakeId" });
            return;
        }
        const db = (0, firestore_1.getFirestore)();
        const ref = db.collection("intakes").doc(intakeId);
        const snap = await ref.get();
        if (!snap.exists) {
            res.status(404).json({ ok: false, error: "intake_not_found" });
            return;
        }
        await ref.set({
            status: "submitted",
            submittedAt: firestore_1.FieldValue.serverTimestamp(),
            ...(form ? { form } : {}),
        }, { merge: true });
        res.json({ ok: true, intakeId });
    }
    catch (e) {
        console.error("[submitIntakeDev] error", e);
        res.status(500).json({ ok: false, error: String((e === null || e === void 0 ? void 0 : e.message) || e) });
    }
});
