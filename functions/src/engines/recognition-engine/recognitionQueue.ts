import { evaluateRecognition } from "../recognition-engine/evaluateRecognition";

export interface RecognitionQueueItem {
  athleteUid: string;
  athleteName: string;
  decision: any;
}

export interface RecognitionQueue {
  stripeAwards: RecognitionQueueItem[];
  certificates: RecognitionQueueItem[];
  testing: RecognitionQueueItem[];
  promotions: RecognitionQueueItem[];
  ceremonies: RecognitionQueueItem[];
}

export function buildRecognitionQueueFromAthletes(athletes: any[]) {
  const queue: RecognitionQueue = {
    stripeAwards: [],
    certificates: [],
    testing: [],
    promotions: [],
    ceremonies: []
  };

  for (const a of athletes) {
    const summary = evaluateRecognition(a);

    const item: RecognitionQueueItem = {
      athleteUid: a.uid,
      athleteName: a.name || a.fullName,
      decision: summary
    };

    // 🟢 STRIPE
    if (summary.stripeAward?.pending) {
      queue.stripeAwards.push(item);
    }

    // 🟢 CERTIFICATE
    if (summary.certificate?.pending) {
      queue.certificates.push(item);
    }

    // 🟢 TESTING
    if (summary.testing?.pending) {
      queue.testing.push(item);
    }

    // 🟢 PROMOTION
    if (summary.promotion?.pending) {
      queue.promotions.push(item);
    }

    // 🟢 CEREMONY
    if (summary.ceremony?.pending) {
      queue.ceremonies.push(item);
    }
  }

  return queue;
}