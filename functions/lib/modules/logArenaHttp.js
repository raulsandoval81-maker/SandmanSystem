"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logArenaHttp = void 0;
const https_1 = require("firebase-functions/v2/https");
const cors_1 = __importDefault(require("cors"));
const xpEngine_1 = require("../xpEngine");
const corsMw = (0, cors_1.default)({ origin: true });
function json(res, code, body) {
    res.status(code).json(body);
}
// V1: coach-only endpoint without auth yet.
// Replace later with real auth (verify ID token + coachUid).
const V1_COACH_UID = "COACH_V1";
exports.logArenaHttp = (0, https_1.onRequest)(async (req, res) => {
    return corsMw(req, res, async () => {
        try {
            if (req.method === "OPTIONS")
                return res.status(204).send("");
            if (req.method !== "POST")
                return json(res, 405, { ok: false, error: "POST only" });
            // Accept both:
            // 1) { data: { uid, kind, amount, meta } } (callable-ish)
            // 2) { uid, kind, amount, meta }          (plain)
            const payload = (req.body?.data ?? req.body) || {};
            // IMPORTANT: uid MUST be athlete DOC ID (athletes/{uid})
            const uid = String(payload.uid || "").trim();
            const kind = String(payload.kind || "").trim();
            const amount = Number(payload.amount ?? 0);
            const meta = payload.meta ?? {};
            if (!uid)
                throw new https_1.HttpsError("invalid-argument", "uid required (athlete doc id)");
            if (!kind.startsWith("ARENA/"))
                throw new https_1.HttpsError("invalid-argument", "kind must start with ARENA/");
            if (!Number.isFinite(amount) || amount <= 0)
                throw new https_1.HttpsError("invalid-argument", "amount must be > 0");
            // V1 allowlist
            const allowed = new Set(["ARENA/BATTLE", "ARENA/PODIUM", "ARENA/STYLEIQ"]);
            if (!allowed.has(kind))
                throw new https_1.HttpsError("invalid-argument", `unsupported arena kind: ${kind}`);
            // tournamentId is mandatory for arena
            const tournamentId = String(meta?.tournamentId ?? "").trim();
            if (!tournamentId)
                throw new https_1.HttpsError("invalid-argument", "meta.tournamentId required");
            // ✅ correct signature: (coachUid, payload)
            const out = await (0, xpEngine_1.runIncrementXp)(V1_COACH_UID, {
                uid,
                kind,
                amount,
                meta: { ...meta, source: meta?.source || "arena" },
            });
            return json(res, 200, {
                ok: true,
                uid,
                kind,
                delta: out?.delta ?? amount,
                afterXp: out?.afterXp ?? null,
                monthKey: out?.monthKey ?? null,
                logId: out?.logId ?? null,
            });
        }
        catch (e) {
            // Normalize HttpsError shape
            const msg = e?.message || "Arena failed";
            const status = e?.code === "invalid-argument" ? 400 :
                e?.code === "failed-precondition" ? 412 :
                    e?.code === "not-found" ? 404 :
                        e?.code === "unauthenticated" ? 401 :
                            500;
            return json(res, status, { ok: false, error: msg, code: e?.code || "unknown" });
        }
    });
});
