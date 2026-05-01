"use strict";
// ⚠️ LEGACY HANDLER (ACTIVE)
// Handles contact + volunteer submissions
// Not yet migrated to /functions v2 or dedicated service layer
// Do NOT delete until migration is complete
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitVolunteer = exports.submitContact = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const cors_1 = __importDefault(require("cors"));
const node_stream_1 = require("node:stream");
const busboy_1 = __importDefault(require("busboy"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const allowCors = (0, cors_1.default)({ origin: true });
// ---------------------------------
// Helpers
// ---------------------------------
function safeTrim(value) {
    return String(value ?? "").trim();
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (Array.isArray(forwarded)) {
        return safeTrim(forwarded[0]?.split(",")[0]);
    }
    return safeTrim(String(forwarded || "").split(",")[0]);
}
// Parse x-www-form-urlencoded or multipart/form-data (HTML forms)
// Falls back to req.body for JSON/debugging requests.
function parseForm(req) {
    return new Promise((resolve, reject) => {
        const contentType = String(req.headers["content-type"] || "");
        if (!contentType.includes("multipart/form-data") &&
            !contentType.includes("application/x-www-form-urlencoded")) {
            const body = (req.body ?? {});
            const normalized = {};
            for (const [key, value] of Object.entries(body)) {
                normalized[key] = safeTrim(value);
            }
            return resolve(normalized);
        }
        try {
            const busboy = (0, busboy_1.default)({ headers: req.headers });
            const fields = {};
            busboy.on("field", (name, val) => {
                fields[name] = safeTrim(val);
            });
            busboy.on("error", reject);
            busboy.on("finish", () => resolve(fields));
            const raw = req.rawBody instanceof Buffer
                ? req.rawBody
                : Buffer.from(req.rawBody || "");
            node_stream_1.Readable.from(raw).pipe(busboy);
        }
        catch (error) {
            reject(error);
        }
    });
}
// Shared minimal server-side guardrails
function basicGuards(fields, minMs = 1000) {
    // Honeypot
    if (safeTrim(fields.nickname)) {
        return { ok: false, reason: "honeypot" };
    }
    // Speed / antibot
    // Light nuisance filter only; client timestamp is not trusted security.
    const ts = Number(fields.__pageload_ts || 0);
    if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < minMs) {
        return { ok: false, reason: "too_fast" };
    }
    return { ok: true };
}
async function saveSubmission(collectionName, data, req) {
    const ip = getClientIp(req);
    const ua = safeTrim(req.headers["user-agent"]);
    const referer = safeTrim(req.headers.referer);
    const doc = {
        ...data,
        _meta: {
            ip,
            ua,
            referer,
            at: admin.firestore.FieldValue.serverTimestamp(),
        },
    };
    await db.collection(collectionName).add(doc);
}
function redirect(res, location) {
    // 303 ensures browser follows with GET
    res.setHeader("Location", location);
    res.status(303).send("");
}
// ---------------------------------
// Handlers
// ---------------------------------
exports.submitContact = functions.https.onRequest(async (req, res) => {
    allowCors(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).send("Method Not Allowed");
        }
        try {
            const fields = await parseForm(req);
            const guards = basicGuards(fields, 1500);
            if (!guards.ok) {
                functions.logger.warn("submitContact blocked by guard", { reason: guards.reason });
                return redirect(res, "/thanks/contact.html");
            }
            const name = safeTrim(fields.name);
            const email = safeTrim(fields.email);
            const subject = safeTrim(fields.subject);
            const message = safeTrim(fields.message);
            if (!name || !email || !message || !isValidEmail(email)) {
                functions.logger.warn("submitContact invalid payload", {
                    hasName: !!name,
                    hasEmail: !!email,
                    emailValid: isValidEmail(email),
                    hasMessage: !!message,
                });
                return redirect(res, "/thanks/contact.html");
            }
            await saveSubmission("contact_submissions", { name, email, subject, message }, req);
            return redirect(res, "/thanks/contact.html");
        }
        catch (error) {
            functions.logger.error("submitContact failed", error);
            return redirect(res, "/thanks/contact.html");
        }
    });
});
exports.submitVolunteer = functions.https.onRequest(async (req, res) => {
    allowCors(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).send("Method Not Allowed");
        }
        try {
            const fields = await parseForm(req);
            const guards = basicGuards(fields, 1500);
            if (!guards.ok) {
                functions.logger.warn("submitVolunteer blocked by guard", { reason: guards.reason });
                return redirect(res, "/thanks/volunteer.html");
            }
            const name = safeTrim(fields.name);
            const email = safeTrim(fields.email);
            const phone = safeTrim(fields.phone);
            const role = safeTrim(fields.role);
            const availability = safeTrim(fields.availability);
            const affiliation = safeTrim(fields.affiliation);
            const message = safeTrim(fields.message);
            if (!name || !email || !isValidEmail(email)) {
                functions.logger.warn("submitVolunteer invalid payload", {
                    hasName: !!name,
                    hasEmail: !!email,
                    emailValid: isValidEmail(email),
                });
                return redirect(res, "/thanks/volunteer.html");
            }
            await saveSubmission("volunteer_submissions", {
                name,
                email,
                phone,
                role,
                availability,
                affiliation,
                message,
            }, req);
            return redirect(res, "/thanks/volunteer.html");
        }
        catch (error) {
            functions.logger.error("submitVolunteer failed", error);
            return redirect(res, "/thanks/volunteer.html");
        }
    });
});
