import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { buildCoachViews } from "../engines/recognition-engine/coachViews";

import { normalizeAthlete } from "../engines/athlete-engine/athleteNormalizer";
import type { AthleteStage } from "../engines/recognition-engine/resolveAthleteStage";
import { resolveAthleteStage } from "../engines/recognition-engine/resolveAthleteStage";
import type { RecognitionQueue } from "../engines/recognition-engine/recognitionQueue";
import { buildRecognitionQueueFromAthletes } from "../engines/recognition-engine/recognitionQueue";

type RecognitionItem = {
  athleteUid: string;
  athleteName: string;
  stage: AthleteStage;
  decision: {
    tier: any;
    stripe: number;
  };
};

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
        if (a.isDev || a.devMode || a.isTest) return false;
        return true;
      });

    // 🟡 OLD SYSTEM (baseline)
    const legacyQueue = buildRecognitionQueueFromAthletes(athletes);

    // 🟢 NEW SYSTEM (manual stage-driven queue)
    const queue: RecognitionQueue = {
      stripeAwards: [],
      certificates: [], // ✅ FIXED (required by type)
      testing: [],
      promotions: [],
      ceremonies: []
    };

    for (const athlete of athletes) {
      const stage = resolveAthleteStage(athlete);

      const item: RecognitionItem = {
        athleteUid: athlete.uid,
        athleteName: athlete.name || athlete.fullName,
        stage,
        decision: {
          tier: athlete.tier,
          stripe: athlete.stripeCount ?? athlete.stripe ?? 0
        }
      };

      switch (stage) {
        case "STRIPE_PROGRESS":
          queue.stripeAwards.push(item);
          break;

        case "TEST_ELIGIBLE":
        case "TEST_SCHEDULED":
        case "TESTING":
        case "TEMPLE":
          queue.testing.push(item);
          break;

        case "PROMOTION":
          queue.promotions.push(item);
          break;

        case "CEREMONY":
          queue.ceremonies.push(item);
          break;

        case "COOLDOWN":
        case "DONE":
          break;

        default:
          console.warn("Unknown stage:", stage, athlete.uid);
      }
    }

    // 🟣 COACH VIEWS (SAFE — AFTER QUEUE EXISTS)
    const coachViews = buildCoachViews(queue);

    res.json({
      ok: true,

      totalAthletes: athletes.length,

      legacy: {
        stripeAwards: legacyQueue.stripeAwards.length,
        certificates: legacyQueue.certificates.length,
        testing: legacyQueue.testing.length,
        promotions: legacyQueue.promotions.length,
        ceremonies: legacyQueue.ceremonies.length
      },

      system: {
        stripeAwards: queue.stripeAwards.length,
        certificates: queue.certificates.length,
        testing: queue.testing.length,
        promotions: queue.promotions.length,
        ceremonies: queue.ceremonies.length
      },

      queue,
      coachViews
    });

  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});