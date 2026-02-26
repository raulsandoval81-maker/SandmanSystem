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
exports.saveWaiver = void 0;
// functions/src/modules/waiver/saveWaiver.ts
/* eslint-disable @typescript-eslint/no-var-requires */
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
if (!admin.apps.length)
    admin.initializeApp();
// Optional mirror: safe no-op if module/file not present
let writeWaiverMirror = async () => { };
try {
    // @ts-ignore: module may not exist in dev; optional dependency
    writeWaiverMirror =
        require("../../infra/waiverMirror").writeWaiverMirror;
}
catch {
    /* keep no-op */
}
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const nowIso = () => new Date().toISOString();
exports.saveWaiver = functions.https.onRequest(async (req, res) => {
    try {
        // --- CORS / method guards ---
        if (req.method === "OPTIONS") {
            Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
            res.status(204).end();
            return;
        }
        if (req.method !== "POST") {
            Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
            res.status(405).json({ ok: false, error: "method_not_allowed" });
            return;
        }
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        // --- Parse body (handle raw string defensively) ---
        const raw = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
        const { intakeId, athleteUid: athleteUidRaw, fileName, pdfBase64, actorUid: actorUidRaw, ackOnly: ackOnlyRaw, } = raw;
        if (!intakeId) {
            res.status(400).json({ ok: false, error: "missing_intakeId" });
            return;
        }
        const db = admin.firestore();
        const bucket = admin.storage().bucket();
        const athleteUid = athleteUidRaw !== null && athleteUidRaw !== void 0 ? athleteUidRaw : null;
        const actorUid = actorUidRaw !== null && actorUidRaw !== void 0 ? actorUidRaw : null;
        const ackOnly = !!ackOnlyRaw;
        let storagePath = null;
        let bytesWritten = 0;
        // --- If not ack-only, require PDF and upload ---
        if (!ackOnly) {
            if (!fileName) {
                res.status(400).json({ ok: false, error: "missing_fileName" });
                return;
            }
            if (!pdfBase64 || typeof pdfBase64 !== "string") {
                res.status(400).json({ ok: false, error: "missing_pdfBase64" });
                return;
            }
            // strip potential data URL prefix
            const b64 = pdfBase64.includes(",") ? pdfBase64.split(",").pop() : pdfBase64;
            const buf = Buffer.from(b64, "base64");
            if (!buf.length) {
                res.status(400).json({ ok: false, error: "invalid_base64" });
                return;
            }
            const d = new Date();
            const yyyy = String(d.getUTCFullYear());
            const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
            const ts = d.toISOString().replace(/[:.]/g, "-");
            storagePath = `waivers/${intakeId}/${yyyy}/${mm}/${ts}-${fileName}`;
            await bucket.file(storagePath).save(buf, {
                contentType: "application/pdf",
                resumable: false,
                validation: "md5",
                metadata: {
                    cacheControl: "private, max-age=3600",
                    metadata: {
                        intakeId,
                        athleteUid: athleteUid !== null && athleteUid !== void 0 ? athleteUid : "",
                        actorUid: actorUid !== null && actorUid !== void 0 ? actorUid : "",
                        uploadedAt: nowIso(),
                    },
                },
            });
            bytesWritten = buf.length;
        }
        // --- Firestore: mark waiver accepted (merge-safe) ---
        const waiverUpdate = {
            waiver: {
                status: "accepted", // critical for approve gate
                accepted: true, // keep boolean for legacy checks
                seen: true,
                updatedAt: nowIso(),
                actorUid: actorUid !== null && actorUid !== void 0 ? actorUid : null,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (storagePath) {
            waiverUpdate.waiver.path = storagePath;
            waiverUpdate.waiver.fileName = fileName !== null && fileName !== void 0 ? fileName : null;
            waiverUpdate.waiver.size = bytesWritten;
        }
        await db.collection("intakes").doc(intakeId).set(waiverUpdate, { merge: true });
        // --- Optional mirror (best-effort) ---
        try {
            await writeWaiverMirror({
                intakeId,
                athleteUid,
                actorUid,
                storagePath,
                bytesWritten,
                ackOnly,
                at: nowIso(),
            });
        }
        catch (mirrorErr) {
            console.warn("[saveWaiver] mirror warn:", mirrorErr);
        }
        res.status(200).json({
            ok: true,
            intakeId,
            path: storagePath,
            bytes: bytesWritten,
            ackOnly,
        });
    }
    catch (err) {
        console.error("[saveWaiver] crash:", err);
        try {
            Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        }
        catch { }
        res.status(500).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || "internal" });
    }
});
