import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const consumeOnboardingToken = functions.https.onCall(async (data, context) => {
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
