// functions/src/modules/intake/createInvite.ts
import { onCall } from "firebase-functions/v2/https";
import { v4 as uuidv4 } from "uuid";
import { IS_EMULATOR, PUBLIC_BASE_URL, PARENT_INTAKE_PATH } from "../../env";
import { logIntakeInvite } from "../../infra/logAdmin";
import { db, FieldValue, Timestamp } from "../../infra/admin";

type Claims = { admin?: boolean; coach?: boolean };

export async function createInviteCore(opts: {
  auth?: { uid?: string | null; token?: Claims | null } | null;
}) {
  const actorUid = opts.auth?.uid ?? null;
  const claims = (opts.auth?.token ?? {}) as Claims;

  // keep your existing gate: prod requires admin, emu allows
  if (!IS_EMULATOR && !claims.admin) {
    throw new Error("Admin only.");
  }

  const tokenId = uuidv4().slice(0, 8);
  const expiresAtMillis = Date.now() + 48 * 60 * 60 * 1000;

  await db.collection("intakes").doc(tokenId).set(
    {
      status: "invited",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      createdBy: actorUid,
      mode: IS_EMULATOR ? "emu" : "prod",
    },
    { merge: true }
  );

  const base = PUBLIC_BASE_URL?.length ? PUBLIC_BASE_URL : "http://localhost:5000";
  const path = PARENT_INTAKE_PATH ?? "/intake-parent/";
  const url = `${base}${path}?token=${tokenId}`;

  try {
    await logIntakeInvite({
      actorUid,
      token: tokenId,
      url,
      expiresAt: expiresAtMillis,
      createdAtMillis: Date.now(),
    } as any);
  } catch (e) {
    console.error("[createInvite] log failed:", e);
  }

  return { ok: true, tokenId, url, expiresAt: expiresAtMillis };
}

// v2 callable
export const createInvite = onCall(async (request) => {
  const auth = request.auth;
  return createInviteCore({
    auth: {
      uid: auth?.uid ?? null,
      token: (auth?.token as Claims) ?? null,
    },
  });
});
