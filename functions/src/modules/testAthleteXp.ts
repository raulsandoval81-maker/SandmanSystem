import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

export const testAthleteXp = onRequest(async (req, res) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    res.status(404).json({ ok: false, error: "Not available in production." });
    return;
  }
  const db = admin.firestore();

  const athleteId = "F4-TEST-0001";
  const ref = db.doc(`athletes/${athleteId}`);

  await ref.set(
    {
      xp: FieldValue.increment(5),
      lastXpTest: new Date().toISOString(),
    },
    { merge: true }
  );

  res.json({
    ok: true,
    athleteId,
    delta: 5,
  });
});
