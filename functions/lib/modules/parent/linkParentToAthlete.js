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
exports.linkParentToAthlete = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const admin = __importStar(require("firebase-admin"));
exports.linkParentToAthlete = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const athleteUid = String(req.data?.athleteUid || "").trim();
    const parentEmail = String(req.data?.parentEmail || "")
        .trim()
        .toLowerCase();
    if (!athleteUid) {
        throw new https_1.HttpsError("invalid-argument", "athleteUid required.");
    }
    if (!parentEmail) {
        throw new https_1.HttpsError("invalid-argument", "parentEmail required.");
    }
    const athleteSnap = await db.collection("athletes").doc(athleteUid).get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    }
    const athlete = athleteSnap.data() || {};
    let parentUid = null;
    try {
        const user = await admin.auth().getUserByEmail(parentEmail);
        parentUid = user.uid;
    }
    catch {
        parentUid = null;
    }
    const linkKey = String(parentUid || parentEmail)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_@.-]/g, "_");
    const linkId = `${linkKey}_${athleteUid}`;
    await db
        .collection("parentAthleteLinks")
        .doc(linkId)
        .set({
        athleteUid,
        athleteName: athlete.publicName ||
            athlete.fullName ||
            athlete.name ||
            athleteUid,
        parentUid,
        parentEmail,
        role: "parent",
        status: parentUid ? "active" : "pending",
        source: "coach_repair_link",
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
        ok: true,
        linkId,
        athleteUid,
        parentEmail,
        parentUid,
        status: parentUid ? "active" : "pending",
    };
});
