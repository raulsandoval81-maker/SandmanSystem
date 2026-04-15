import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const onboardingConfirmStep1 = functions.https.onCall(async (data, context) => {
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

  const a: any = snap.data() || {};
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

  const patch: any = {
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

  if (!serverAuthUid) patch.authUid = userUid;

  await ref.update(patch);

  return { ok: true };
});