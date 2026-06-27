import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { normalizeAthlete } from "../engines/athlete-engine/athleteNormalizer";
import { buildRecognitionQueueFromAthletes } from "../engines/recognition-engine/recognitionQueue";

export const testRecognitionQueue = onRequest(async (_req, res) => {
  try {
    const db = getFirestore();

    const snapshot = await db.collection("athletes").get();

    const athletes = snapshot.docs
      .map((doc) =>
        normalizeAthlete({
          uid: doc.id,
          ...doc.data()
        })
      )
      .filter((a: any) => {
        if (a.rosterStatus !== "current") return false;
        if (a.isDev === true || a.devMode === true || a.isTest === true) return false;
        return true;
      });

    const queue = buildRecognitionQueueFromAthletes(athletes);

    res.json({
      ok: true,
      totalAthletes: athletes.length,
      stripeAwards: queue.stripeAwards.length,
      certificates: queue.certificates.length,
      testing: queue.testing.length,
      promotions: queue.promotions.length,
      ceremonies: queue.ceremonies.length,
      queue
    });

  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});