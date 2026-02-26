import * as admin from "firebase-admin";

export async function generateMintTagSerial(
  db: admin.firestore.Firestore,
  track: string,
  lane: string,
  virtue: string
) {
  const key = `mint_${track}_${lane}`; // mint_F8_CB
  const ref = db.collection("counters").doc(key);

  const { seq, tag } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap.exists ? (snap.data()?.seq as number) : 0) || 0;
    const next = cur + 1;

    tx.set(ref, { seq: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    const padded = String(next).padStart(4, "0");
    const safeVirtue = (virtue || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    return { seq: next, tag: `${track}-${lane}-${padded}-${safeVirtue}` };
  });

  return { seq, tag };
}
