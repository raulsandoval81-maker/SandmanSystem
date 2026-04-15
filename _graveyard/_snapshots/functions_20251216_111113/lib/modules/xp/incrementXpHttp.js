"use strict";
// ------------------------------------------------------------
// incrementXpHttp.ts  —  XP Increment via HTTP (for web tester)
// ------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementXpHttp = void 0;
const https_1 = require("firebase-functions/v2/https");
const incrementXpCore_1 = require("./incrementXpCore");
exports.incrementXpHttp = (0, https_1.onRequest)(async (req, res) => {
    // --- CORS headers ---
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
    try {
        const body = req.body && req.body.data ? req.body.data : req.body || {};
        const result = await (0, incrementXpCore_1.handleIncrementXp)(body, { authUid: "http-local" });
        res.status(200).json(result);
    }
    catch (err) {
        console.error("incrementXpHttp error:", err);
        res.status(500).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || "server error" });
    }
});
