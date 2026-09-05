import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { decideOnboardingBinding } from "./services/onboardingBindingPolicy";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const onboardingConfirmStep1 = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
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
    if (!athleteSnap.exists) throw new functions.https.HttpsError("not-found", "Athlete not found.");
    const athlete: any = athleteSnap.data() || {};
    const serverAuthUid = typeof athlete.authUid === "string" && athlete.authUid.trim()
      ? athlete.authUid.trim() : null;
    const onboarding = athlete.onboarding && typeof athlete.onboarding === "object" ? athlete.onboarding : {};
    const locks = onboarding.locks && typeof onboarding.locks === "object" ? onboarding.locks : {};

    if (serverAuthUid && serverAuthUid !== userUid) {
      throw new functions.https.HttpsError("permission-denied", "Profile bound to another account.");
    }
    if (locks.step1 === true && serverAuthUid === userUid) return { ok: true, already: true };
    if (!tokenId) throw new functions.https.HttpsError("invalid-argument", "Missing onboarding token.");
    const tokenRef = db.collection("onboardingTokens").doc(tokenId);
    const tokenSnap = await tx.get(tokenRef);
    const token: any = tokenSnap.data() || {};
    let decision;
    try {
      decision = decideOnboardingBinding({
        athleteId, callerUid: userUid, existingAuthUid: serverAuthUid,
        step1Locked: locks.step1 === true, tokenId, tokenExists: tokenSnap.exists,
        tokenAthleteUid: String(token.athleteUid || ""), tokenUsed: Boolean(token.usedAt),
        tokenExpiresAt: Number(token.exp || 0), now: Date.now(),
      });
    } catch (error: any) {
      const reason = String(error?.message || "");
      if (reason === "TOKEN_NOT_FOUND") throw new functions.https.HttpsError("not-found", "Token not found.");
      if (reason === "TOKEN_ATHLETE_MISMATCH") throw new functions.https.HttpsError("permission-denied", "Token does not match athlete.");
      if (reason === "TOKEN_USED") throw new functions.https.HttpsError("failed-precondition", "Token already used.");
      if (reason === "TOKEN_EXPIRED") throw new functions.https.HttpsError("failed-precondition", "Token expired.");
      throw error;
    }

    const stamp = admin.firestore.FieldValue.serverTimestamp();
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
