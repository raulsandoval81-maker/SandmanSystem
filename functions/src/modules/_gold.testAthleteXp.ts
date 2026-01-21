import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";

export const testAthleteXp = onRequest(async (req, res) => {
  const db = admin.firestore();

  const athleteId = "F4-TEST-0001";
  const delta = 5;

  const ref = db.doc(`athletes/${athleteId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const beforeXp = (snap.exists ? (snap.data()?.xp ?? 0) : 0) as number;
    const afterXp = beforeXp + delta;

    // 1) update athlete xp (exact number, no increment)
    tx.set(
      ref,
      {
        xp: afterXp,
        lastXpTest: new Date().toISOString(),
      },
      { merge: true }
    );

    // 2) write an immutable log row (auto-id)
    const logRef = db.collection("xp_logs").doc();
    tx.set(logRef, {
      athleteId,
      delta,
      beforeXp,
      afterXp,
      source: "TEST",
      ts: FieldValue.serverTimestamp(),
    });
  });

  res.json({
    ok: true,
    athleteId,
    delta,
  });
});
