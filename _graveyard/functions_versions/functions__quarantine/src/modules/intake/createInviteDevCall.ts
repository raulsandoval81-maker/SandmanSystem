// functions/src/modules/intake/createInviteDevCall.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import crypto from "node:crypto";
import { db, FieldValue } from "../../infra/admin";

function isEmulator() {
  return !!(
    process.env.FUNCTIONS_EMULATOR ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}
function isCoachOrAdmin(token?: any) {
  return !!(token?.coach === true || token?.admin === true);
}

export const createInviteDevCall = onCall(async (req) => {
  const { auth } = req;

  // dev: allow in emulator; prod: require role
  if (!isEmulator() && (!auth || !isCoachOrAdmin(auth.token))) {
    throw new HttpsError("permission-denied", "Not allowed");
  }

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 48 * 3600 * 1000;

  await db.collection("intakeTokens").doc(token).set({
    exp: expiresAt,
    createdAt: FieldValue.serverTimestamp(),
    by: auth?.uid ?? null,
  });

  return {
    ok: true,
    token,
    hintPath: "/silver",
    expiresAt,
  };
});
