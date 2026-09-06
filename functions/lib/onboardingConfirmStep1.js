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
exports.onboardingConfirmStep1 = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const onboardingBindingPolicy_1 = require("./services/onboardingBindingPolicy");
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
exports.onboardingConfirmStep1 = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const signInProvider = String(context.auth.token.firebase?.sign_in_provider || "");
    const authEmail = String(context.auth.token.email || "").trim();
    if (signInProvider === "anonymous" || !authEmail) {
        throw new functions.https.HttpsError("permission-denied", "An email-backed athlete login is required.");
    }
    const athleteId = String(data?.athleteId || "").trim().toUpperCase();
    const tokenId = String(data?.tokenId || "").trim();
    if (!athleteId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing athleteId.");
    }
    const userUid = context.auth.uid;
    const athleteRef = db.collection("athletes").doc(athleteId);
    return db.runTransaction(async (tx) => {
        const athleteSnap = await tx.get(athleteRef);
        if (!athleteSnap.exists)
            throw new functions.https.HttpsError("not-found", "Athlete not found.");
        const athlete = athleteSnap.data() || {};
        const serverAuthUid = typeof athlete.authUid === "string" && athlete.authUid.trim()
            ? athlete.authUid.trim() : null;
        const onboarding = athlete.onboarding && typeof athlete.onboarding === "object" ? athlete.onboarding : {};
        const locks = onboarding.locks && typeof onboarding.locks === "object" ? onboarding.locks : {};
        if (serverAuthUid && serverAuthUid !== userUid) {
            throw new functions.https.HttpsError("permission-denied", "Profile bound to another account.");
        }
        if (locks.step1 === true && serverAuthUid === userUid)
            return { ok: true, already: true };
        if (!tokenId)
            throw new functions.https.HttpsError("invalid-argument", "Missing onboarding token.");
        const tokenRef = db.collection("onboardingTokens").doc(tokenId);
        const tokenSnap = await tx.get(tokenRef);
        const token = tokenSnap.data() || {};
        let decision;
        try {
            decision = (0, onboardingBindingPolicy_1.decideOnboardingBinding)({
                athleteId, callerUid: userUid, existingAuthUid: serverAuthUid,
                step1Locked: locks.step1 === true, tokenId, tokenExists: tokenSnap.exists,
                tokenAthleteUid: String(token.athleteUid || ""), tokenUsed: Boolean(token.usedAt),
                tokenExpiresAt: Number(token.exp || 0), now: Date.now(),
            });
        }
        catch (error) {
            const reason = String(error?.message || "");
            if (reason === "TOKEN_NOT_FOUND")
                throw new functions.https.HttpsError("not-found", "Token not found.");
            if (reason === "TOKEN_ATHLETE_MISMATCH")
                throw new functions.https.HttpsError("permission-denied", "Token does not match athlete.");
            if (reason === "TOKEN_USED")
                throw new functions.https.HttpsError("failed-precondition", "Token already used.");
            if (reason === "TOKEN_EXPIRED")
                throw new functions.https.HttpsError("failed-precondition", "Token expired.");
            throw error;
        }
        const stamp = firestore_1.FieldValue.serverTimestamp();
        tx.update(athleteRef, {
            authUid: userUid,
            updatedAt: stamp,
            onboarding: {
                ...onboarding,
                step: Math.max(2, Number(onboarding.step) || 0),
                locks: { ...locks, step1: true },
                status: onboarding.status || "started",
                version: onboarding.version || "v1",
                startedAt: onboarding.startedAt || stamp,
                step1At: onboarding.step1At || stamp,
            },
        });
        tx.update(tokenRef, { usedAt: stamp, usedByUid: userUid });
        return { ok: true, repaired: decision.repaired };
    });
});
