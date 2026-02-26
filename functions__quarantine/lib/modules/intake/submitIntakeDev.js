"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitIntakeDev = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const env_1 = require("../../env");
exports.submitIntakeDev = (0, https_1.onRequest)(async (req, res) => {
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
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
