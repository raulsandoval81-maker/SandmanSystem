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
exports.createAthleteOnboardingToken = void 0;
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
if (!admin.apps.length)
    admin.initializeApp();
const db = (0, firestore_1.getFirestore)();
const MANAGEMENT_ROLES = new Set([
    "admin",
    "management",
    "manager",
    "location_manager",
]);
const TOKEN_HOURS = 48;
exports.createAthleteOnboardingToken = (0, https_1.onCall)(async (req) => {
    const staffUid = req.auth?.uid;
    if (!staffUid) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    const staffSnap = await db.doc(`staff/${staffUid}`).get();
    if (!staffSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "Staff access required");
    }
    const staff = staffSnap.data() || {};
    const role = String(staff.role || "")
        .trim()
        .toLowerCase();
    const status = String(staff.status || "")
        .trim()
        .toLowerCase();
    if (status !== "active" ||
        !MANAGEMENT_ROLES.has(role)) {
        throw new https_1.HttpsError("permission-denied", "Active Management access required");
    }
    const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
    if (!athleteUid) {
        throw new https_1.HttpsError("invalid-argument", "Missing athleteUid.");
    }
    const athleteRef = db.collection("athletes").doc(athleteUid);
    const athleteSnap = await athleteRef.get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", `Athlete not found: ${athleteUid}`);
    }
    const tokenId = crypto.randomBytes(32).toString("hex");
    const exp = Date.now() + TOKEN_HOURS * 60 * 60 * 1000;
    await db.collection("onboardingTokens").doc(tokenId).set({
        athleteUid,
        exp,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdBy: staffUid,
        createdByRole: role,
        source: "management_athlete_access",
    });
    return {
        ok: true,
        athleteUid,
        tokenId,
        exp,
    };
});
