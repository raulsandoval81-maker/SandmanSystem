import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const getParentInbox = onCall(async (req) => {
  const db = getFirestore();

  const parentUid =
    String(req.data?.parentUid || "").trim();

  let query: FirebaseFirestore.Query =
    db.collection("parentInbox");

  if (parentUid) {
    query = query.where(
      "parentUid",
      "==",
      parentUid
    );
  }

  const snap = await query
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
    unreadCount,
    items,
  };
});