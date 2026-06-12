import { onCall } from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";

export const markParentInboxRead = onCall(async (req) => {
  const db = getFirestore();

  const messageId =
    String(req.data?.messageId || "").trim();

  if (!messageId) {
    return {
      ok: false,
      error: "Missing messageId",
    };
  }

  await db
    .collection("parentInbox")
    .doc(messageId)
    .set(
      {
        read: true,
        readAt: FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

  return {
    ok: true,
    messageId,
  };
});