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
exports.activateAthlete = void 0;
// functions/src/onboarding.ts
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
if (!admin.apps.length)
    admin.initializeApp();
const db = (0, firestore_1.getFirestore)();
exports.activateAthlete = (0, https_1.onCall)(async (req) => {
    const p = req.data || {};
    if (!p.uid || !p.padlockId || !p.track || !p.klass || !p.tier || !p.publicName) {
        throw new https_1.HttpsError("invalid-argument", "missing fields");
    }
    const uid = p.uid;
    const intakeRef = db.doc(`intakes/${uid}`);
    const pubRef = db.doc(`athletes_public/${uid}`);
    const privRef = db.doc(`athletes_private/${uid}`);
    const mk = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    await db.runTransaction(async (tx) => {
        const intakeSnap = await tx.get(intakeRef);
        if (!intakeSnap.exists)
            throw new https_1.HttpsError("failed-precondition", "parent intake not found");
        const intake = intakeSnap.data();
        // public surface (athlete & parent can read)
        const publicDoc = {
            uid,
            displayName: p.publicName,
            track: p.track,
            class: p.klass,
            tier: p.tier,
            status: "active",
            compGate: p.track === "foundry4" ? 800 : 800, // unify gate for now
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        // private surface (coach-only; contains sensitive fields from intake)
        const privateDoc = {
            uid,
            padlockId: p.padlockId,
            legalFirst: intake.legalFirst || "",
            legalLast: intake.legalLast || "",
            dob: intake.dob || null,
            parentEmail: intake.parentEmail || "",
            parentPhone: intake.parentPhone || "",
            emergencyName: intake.emergencyName || "",
            emergencyPhone: intake.emergencyPhone || "",
            medicalNotes: intake.medicalNotes || "",
            track: p.track,
            class: p.klass,
            tier: p.tier,
            flags: intake.flags || {}, // veteran/fastTrack if parent hinted
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            source: "parent_intake",
        };
        tx.set(pubRef, publicDoc, { merge: true });
        tx.set(privRef, privateDoc, { merge: true });
        tx.set(intakeRef, { status: "activated", activatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        // seed monthly counters so UI isn’t blank (optional)
        tx.set(db.doc(`xpCounters/${uid}/months/${mk}`), { mk, seeded: true }, { merge: true });
    });
    return { ok: true };
});
