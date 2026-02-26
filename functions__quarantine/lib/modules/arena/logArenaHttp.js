"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logArenaHttp = void 0;
// functions/src/modules/arena/logArenaHttp.ts
const https_1 = require("firebase-functions/v2/https");
const logArenaCore_1 = require("./logArenaCore");
exports.logArenaHttp = (0, https_1.onRequest)(async (req, res) => {
    // CORS like your other function
    res.set("Access-Control-Allow-Origin", "http://localhost:5000");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
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
        const result = await (0, logArenaCore_1.handleLogArena)(body, { authUid: "http-local" });
        res.status(200).json(result);
    }
    catch (err) {
        console.error("[logArenaHttp] crash:", err);
        res.status(500).json({ ok: false, error: err?.message || "server error" });
    }
});
