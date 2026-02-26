"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xpHttp = void 0;
const https_1 = require("firebase-functions/v2/https");
const cors_1 = __importDefault(require("cors"));
const xpEngine_1 = require("./xpEngine");
const corsMw = (0, cors_1.default)({ origin: true });
function isEmulator() {
    return process.env.FUNCTIONS_EMULATOR === "true" || !!process.env.FIREBASE_EMULATOR_HUB;
}
exports.xpHttp = (0, https_1.onRequest)((req, res) => {
    corsMw(req, res, async () => {
        // ✅ handle preflight
        if (req.method === "OPTIONS")
            return res.status(204).send("");
        if (req.method !== "POST")
            return res.status(405).send("POST only");
        // ✅ lock this to emulator unless you explicitly want prod HTTP
        if (!isEmulator())
            return res.status(403).json({ ok: false, error: "xpHttp is emulator-only" });
        // ✅ require a header so random tabs can’t hit it accidentally
        const coachUid = String(req.headers["x-coach-uid"] || "").trim();
        if (!coachUid)
            return res.status(401).json({ ok: false, error: "Missing x-coach-uid" });
        try {
            const payload = req.body?.data ?? req.body ?? {};
            const out = await (0, xpEngine_1.runIncrementXp)(coachUid, payload);
            return res.status(200).json(out); // 👈 your engine already returns {ok:true...} or blocked/ok
        }
        catch (e) {
            // If your engine throws HttpsError, keep the message clean
            const msg = e?.message || "XP failed";
            return res.status(400).json({ ok: false, error: msg });
        }
    });
});
