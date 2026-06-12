import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const getTestingHistory = onCall(async () => {
  const db = getFirestore();

  const snap = await db
    .collection("testingEvents")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return {
    ok: true,
    events: snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:
        doc.data().createdAt?.toDate?.().toISOString?.() ?? null,
    })),
  };
});