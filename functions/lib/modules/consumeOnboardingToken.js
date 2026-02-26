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
exports.consumeOnboardingToken = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
exports.consumeOnboardingToken = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    }
    const tokenId = String(data?.tokenId || "").trim();
    const deviceId = String(data?.deviceId || "").slice(0, 300) || null;
    if (!tokenId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing tokenId.");
    }
    const tokenRef = db.collection("onboardingTokens").doc(tokenId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(tokenRef);
        if (!snap.exists) {
            throw new functions.https.HttpsError("not-found", "Token not found.");
        }
        const t = snap.data() || {};
        const athleteUid = String(t.athleteUid || "").trim();
        if (!athleteUid) {
            throw new functions.https.HttpsError("failed-precondition", "Token missing athleteUid.");
        }
        if (t.usedAt) {
            throw new functions.https.HttpsError("failed-precondition", "Token already used.");
        }
        const exp = Number(t.exp || 0);
        if (exp && Date.now() > exp) {
            throw new functions.https.HttpsError("failed-precondition", "Token expired.");
        }
        // consume token
        tx.update(tokenRef, {
            usedAt: admin.firestore.FieldValue.serverTimestamp(),
            usedByDeviceId: deviceId,
        });
        // stamp athlete
        const athleteRef = db.collection("athletes").doc(athleteUid);
        tx.update(athleteRef, {
            onboardingClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
            onboardingDeviceId: deviceId,
            onboardingClaimStatus: "claimed",
        });
        return { ok: true, athleteUid };
    });
});
