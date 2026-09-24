import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";

export const markParentInboxRead = onCall(async (req) => {
  const parentUid = String(req.auth?.uid || "").trim();

  if (!parentUid) {
    throw new HttpsError(
      "unauthenticated",
      "Parent must be signed in."
    );
  }

  const db = getFirestore();

  const messageId =
    String(req.data?.messageId || "").trim();

  if (!messageId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing messageId."
    );
  }

  const messageRef = db
    .collection("parentInbox")
    .doc(messageId);

  const messageSnap = await messageRef.get();

  if (!messageSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Parent inbox message not found."
    );
  }

  const messageParentUid = String(
    messageSnap.data()?.parentUid || ""
  ).trim();

  if (messageParentUid !== parentUid) {
    throw new HttpsError(
      "permission-denied",
      "This parent inbox message is outside your authorized scope."
    );
  }

  await messageRef.update({
    read: true,
    readAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    messageId,
  };
});
