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
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
exports.onboardingConfirmStep1 = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const athleteId = String(data?.athleteId || "").trim().toUpperCase();
    if (!athleteId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing athleteId.");
    }
    const userUid = context.auth.uid;
    const ref = db.collection("athletes").doc(athleteId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new functions.https.HttpsError("not-found", "Athlete not found.");
    }
    const a = snap.data() || {};
    const serverAuthUid = typeof a.authUid === "string" ? a.authUid : null;
    if (serverAuthUid && serverAuthUid !== userUid) {
        throw new functions.https.HttpsError("permission-denied", "Profile bound to another account.");
    }
    const onboarding = a.onboarding && typeof a.onboarding === "object" ? a.onboarding : {};
    const locks = onboarding.locks && typeof onboarding.locks === "object" ? onboarding.locks : {};
    // If already confirmed, no-op
    if (locks.step1 === true) {
        return { ok: true, already: true };
    }
    const patch = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        onboarding: {
            ...onboarding,
            step: 2,
            locks: {
                step1: true,
                step2: false,
                step3: false,
                step4: false,
                step5: false,
                step6: false,
                step7: false,
                step8: false,
                step9: false,
            },
            status: "started",
            version: "v1",
            startedAt: onboarding.startedAt || admin.firestore.FieldValue.serverTimestamp(),
            step1At: admin.firestore.FieldValue.serverTimestamp(),
        },
    };
    if (!serverAuthUid)
        patch.authUid = userUid;
    await ref.update(patch);
    return { ok: true };
});
