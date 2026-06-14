import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

export const getParentInbox = onCall(async (req) => {
  const db = getFirestore();

  const parentUid =
    req.auth?.uid || "";

  if (!parentUid) {
    throw new HttpsError(
      "unauthenticated",
      "Parent must be signed in."
    );
  }

  const snap = await db
    .collection("parentInbox")
    .where("parentUid", "==", parentUid)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const items = snap.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      read: data.read === true,
      createdAt:
        data.createdAt?.toDate?.().toISOString?.() ?? null,
    };
  });

  const unreadCount =
    items.filter(
      (item) => item.read !== true
    ).length;

  return {
    ok: true,
    parentUid,
    unreadCount,
    items,
  };
});