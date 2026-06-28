"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testXpWrite = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("../admin");
exports.testXpWrite = (0, https_1.onRequest)(async (req, res) => {
    try {
        const db = admin_1.admin.firestore();
        const ref = db.collection("_debug").doc("testXpWrite");
        const payload = {
            ok: true,
            ts: Date.now(),
            iso: new Date().toISOString(),
            note: "hello from testXpWrite",
        };
        await ref.set(payload, { merge: true });
        res.status(200).json({ wrote: true, path: ref.path, payload });
    }
    catch (e) {
        console.error("testXpWrite ERROR:", e?.stack || e);
        res.status(500).json({ wrote: false, error: String(e?.message || e) });
    }
});
