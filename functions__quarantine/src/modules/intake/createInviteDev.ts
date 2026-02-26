// functions/src/modules/intake/createInviteDev.ts
import { onCall } from "firebase-functions/v2/https";
import { v4 as uuidv4 } from "uuid";
import { db, FieldValue, Timestamp } from "../../infra/admin";

export const createInviteDev = onCall(async (request) => {
  // emulator-only guard (simple + strict)
  const isEmu =
    process.env.FUNCTIONS_EMULATOR === "true" ||
    !!process.env.FIRESTORE_EMULATOR_HOST ||
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

  if (!isEmu) throw new Error("Emulator only.");

  const actorUid = request.auth?.uid ?? null;

  const tokenId = uuidv4().slice(0, 8);
  const expiresAtMillis = Date.now() + 48 * 60 * 60 * 1000;

  await db.collection("intakes").doc(tokenId).set(
    {
      status: "invited",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      createdBy: actorUid,
      mode: "emu",
    },
    { merge: true }
  );

  // local dev url (fine for dev callable)
  const url = `http://localhost:5000/intake-parent/?token=${tokenId}`;

  return { ok: true, tokenId, url, expiresAt: expiresAtMillis };
});
