"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xpHttp = void 0;
const https_1 = require("firebase-functions/v2/https");
const cors_1 = __importDefault(require("cors"));
const xpEngine_1 = require("../xpEngine");
const corsMw = (0, cors_1.default)({ origin: true });
function normalizeKind(kind) {
    const raw = String(kind ?? "").trim();
    const up = raw.toUpperCase();
    // Canonicalize common aliases/case
    if (up === "ATTENDANCE")
        return "ATTENDANCE";
    if (up === "STRENGTH")
        return "STRENGTH";
    if (up === "HONOR")
        return "HONOR";
    // Arena kinds should pass through exactly as you use them
    // (e.g., "ARENA/BATTLE", "ARENA/PODIUM", "ARENA/STYLEIQ")
    if (up.startsWith("ARENA/"))
        return up;
    // Dev kinds (if you use them)
    if (up.startsWith("DEV/"))
        return up;
    // Otherwise return as-is (xpEngine will decide)
    return raw;
}
exports.xpHttp = (0, https_1.onRequest)((req, res) => {
    corsMw(req, res, async () => {
        if (req.method === "OPTIONS")
            return res.status(204).send("");
        if (req.method !== "POST")
            return res.status(405).send("POST only");
        const coachUid = String(req.headers["x-coach-uid"] || "").trim();
        if (!coachUid)
            return res.status(401).json({ ok: false, error: "Missing x-coach-uid" });
        try {
            const payload = req.body?.data ?? req.body ?? {};
            // ✅ normalize at the choke point (affects all 4 pages)
            payload.kind = normalizeKind(payload.kind);
            const out = await (0, xpEngine_1.runIncrementXp)(coachUid, payload);
            return res.status(200).json(out);
        }
        catch (e) {
            const msg = e?.message || "XP failed";
            return res.status(400).json({ ok: false, error: msg });
        }
    });
});
