import { evaluateRecognition } from "./recognitionEngine";
import { RecognitionDecision } from "./recognitionTypes";

export interface RecognitionQueueItem {
  athleteUid: string;
  athleteName: string;
  decision: RecognitionDecision;
}

export interface RecognitionQueue {
  stripeAwards: RecognitionQueueItem[];
  certificates: RecognitionQueueItem[];
  testing: RecognitionQueueItem[];
  promotions: RecognitionQueueItem[];
  ceremonies: RecognitionQueueItem[];
}

function athleteUid(athlete: any): string {
  return athlete.uid || athlete.uidCode || athlete.id || "";
}

function athleteName(athlete: any): string {
  return athlete.name || athlete.fullName || athlete.publicName || athleteUid(athlete);
}

function makeItem(
  athlete: any,
  decision: RecognitionDecision
): RecognitionQueueItem {
  return {
    athleteUid: athleteUid(athlete),
    athleteName: athleteName(athlete),
    decision
  };
}

export function buildRecognitionQueueFromAthletes(
  athletes: any[]
): RecognitionQueue {
  const queue: RecognitionQueue = {
    stripeAwards: [],
    certificates: [],
    testing: [],
    promotions: [],
    ceremonies: []
  };

  athletes.forEach((athlete) => {
    const summary = evaluateRecognition(athlete);

    if (summary.stripeAward?.pending) {
      queue.stripeAwards.push(makeItem(athlete, summary.stripeAward));
    }

    if (summary.certificate?.pending) {
      queue.certificates.push(makeItem(athlete, summary.certificate));
    }

    if (summary.testing?.pending) {
      queue.testing.push(makeItem(athlete, summary.testing));
    }

    if (summary.promotion?.pending) {
      queue.promotions.push(makeItem(athlete, summary.promotion));
    }

    if (summary.ceremony?.pending) {
      queue.ceremonies.push(makeItem(athlete, summary.ceremony));
    }
  });

  return queue;
}