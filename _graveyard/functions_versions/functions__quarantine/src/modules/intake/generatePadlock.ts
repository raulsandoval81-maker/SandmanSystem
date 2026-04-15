import * as admin from "firebase-admin";

export async function generatePadlock(db: admin.firestore.Firestore) {
  const ref = db.collection("meta").doc("padlockCounter");

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    // keep ONE field name: seq (don’t mix current/seq)
    const current = snap.exists ? (snap.data()?.seq ?? 0) : 0;
    const next = current + 1;

    tx.set(ref, { seq: next }, { merge: true });

    return {
      seq: next,
      padlock: `A${String(next).padStart(6, "0")}`, // A000001
    };
  });

  return result;
}
