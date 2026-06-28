import type { RecognitionQueue } from "./recognitionQueue";

export interface CoachViews {
  readiness: any[];
  action: any[];
  reward: any[];
}

/**
 * Splits raw recognition queue into coach-readable operational layers
 */
export function buildCoachViews(queue: RecognitionQueue): CoachViews {
  return {
    // 🟡 READINESS (WHO IS APPROACHING A DECISION)
    readiness: [
      ...queue.testing,
    ],

    // 🔵 ACTION (WHAT COACH MUST ACT ON)
    action: [
      ...queue.promotions,
      ...queue.testing,
    ],

    // 🟢 REWARD (WHAT HAS BEEN EARNED / COMPLETED)
    reward: [
      ...queue.stripeAwards,
      ...queue.certificates,
      ...queue.ceremonies,
    ]
  };
}