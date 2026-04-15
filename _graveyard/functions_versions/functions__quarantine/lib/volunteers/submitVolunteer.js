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
exports.submitVolunteer = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
exports.submitVolunteer = (0, https_1.onRequest)(async (req, res) => {
    // --- CORS ---
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
        const { seasonYear, eventId, parentName, athleteName, phone, email, language, helps, notes, timestamp, } = req.body || {};
        if (!seasonYear || !eventId) {
            res.status(400).json({ ok: false, error: "Missing seasonYear or eventId" });
            return;
        }
        if (!parentName || !athleteName) {
            res.status(400).json({ ok: false, error: "Missing parent or athlete name" });
            return;
        }
        const path = `volunteers/${seasonYear}/events/${eventId}/signups`;
        const docRef = await db.collection(path).add({
            seasonYear,
            eventId,
            parentName,
            athleteName,
            phone: phone || "",
            email: email || "",
            language: language || "",
            helps: Array.isArray(helps) ? helps : [],
            notes: notes || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: timestamp || null,
        });
        res.status(200).json({
            ok: true,
            signupId: docRef.id,
            message: "Volunteer submission saved.",
        });
    }
    catch (err) {
        console.error("submitVolunteer ERROR:", err);
        res.status(500).json({
            ok: false,
            error: err?.message || "Server error",
        });
    }
});
