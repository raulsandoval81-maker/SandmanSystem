import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const getParentInbox = onCall(async (req) => {
  const db = getFirestore();

  const parentUid =
    String(req.data?.parentUid || "").trim();

  let query = db
    .collection("parentInbox")
    .orderBy("createdAt", "desc")
    .limit(50);

  const snap = parentUid
    ? await query.where("parentUid", "==", parentUid).get()
    : await query.get();

  return {
    ok: true,
    items: snap.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        createdAt:
          data.createdAt?.toDate?.().toISOString?.() ?? null,
      };
    }),
  };
});