// functions/src/modules/intake/createInviteCore.ts
import { db, FieldValue, Timestamp } from "../../infra/admin";
import { PUBLIC_BASE_URL, PARENT_INTAKE_PATH } from "../../env";

type CoreArgs = { actorUid: string; mode: "emu" | "prod" };
type CoreResult = { tokenId: string; url: string };

export async function createInviteCore(args: CoreArgs): Promise<CoreResult> {

  // new token doc
  const tokenRef = db.collection("intakes").doc();
  const tokenId = tokenRef.id;

  const base =
    PUBLIC_BASE_URL && PUBLIC_BASE_URL.length > 0
      ? PUBLIC_BASE_URL
      : "http://localhost:5000";

  // ✅ Intake-proof default: if env is missing, route to real parent intake page
  const path =
    PARENT_INTAKE_PATH && String(PARENT_INTAKE_PATH).trim().length > 0
      ? String(PARENT_INTAKE_PATH).trim()
      : "/intake-parent/";

  // Invite URL
  const url = `${base}${path}?token=${tokenId}`;

  // 48h expiry using Firestore Timestamp from millis
  const expiresAt = Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000);

  await tokenRef.set(
    {
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: args.actorUid,
      mode: args.mode, // "emu" | "prod"
      expiresAt,
    },
    { merge: false }
  );

  return { tokenId, url };
}
