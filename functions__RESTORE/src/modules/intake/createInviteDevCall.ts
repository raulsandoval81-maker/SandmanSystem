// functions/src/modules/intake/createInviteDevCall.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

function isEmulator() {
  return !!(process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}
function isCoachOrAdmin(token?: any) {
  return !!(token?.coach === true || token?.admin === true);
}

export const createInviteDevCall = functions.https.onCall(async (_data, ctx) => {
  // dev: allow in emulator; prod: require role
  if (!isEmulator() && (!ctx.auth || !isCoachOrAdmin(ctx.auth.token))) {
    throw new functions.https.HttpsError("permission-denied", "Not allowed");
  }

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 48 * 3600 * 1000;

  await admin.firestore().collection("intakeTokens").doc(token).set({
    exp: expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    by: ctx.auth?.uid ?? null,
  });

  // The UI can assemble the URL; we return a hint path for convenience.
  return {
    ok: true,
    token,
    // If you host Silver at /silver, this is the path you’d attach ?invite=TOKEN to:
    hintPath: "/silver",
    expiresAt,
  };
});
