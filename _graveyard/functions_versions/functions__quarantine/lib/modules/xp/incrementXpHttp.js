"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementXpHttp = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger_1 = require("firebase-functions/logger");
const incrementXpCore_1 = require("./incrementXpCore");
exports.incrementXpHttp = (0, https_1.onRequest)({
    // This alone should handle preflight + set Access-Control-Allow-Origin
    cors: true,
}, async (req, res) => {
    // v2 cors:true handles OPTIONS, but harmless to keep a guard:
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "Method Not Allowed" });
        return;
    }
    try {
        // Body should already be parsed if you POST JSON with Content-Type: application/json
        const data = (req.body ?? {});
        const result = await (0, incrementXpCore_1.handleIncrementXp)(data, { authUid: null });
        res.status(200).json(result);
    }
    catch (err) {
        logger_1.logger.error("incrementXpHttp failed", err);
        res.status(400).json({ ok: false, error: err?.message || "xp error" });
    }
});
