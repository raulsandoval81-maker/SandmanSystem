export type RecognitionType =
  | "NONE"
  | "STRIPE_AWARD"
  | "CERTIFICATE"
  | "TESTING"
  | "PROMOTION"
  | "CEREMONY";

export interface RecognitionDecision {
  type: RecognitionType;
  eligible: boolean;
  pending: boolean;
  completed: boolean;
  tier: number;
  stripe?: number;
  message: string;
}

export interface RecognitionSummary {
  stripeAward?: RecognitionDecision;
  certificate?: RecognitionDecision;
  testing?: RecognitionDecision;
  promotion?: RecognitionDecision;
  ceremony?: RecognitionDecision;
  nextAction: string;
}

/**
 * 🔥 ADD THIS (THIS WAS YOUR MISSING PIECE)
 */
export interface RecognitionQueueItem {
  athleteUid: string;
  athleteName: string;
  decision: RecognitionDecision;
}

/**
 * 🔥 ADD THIS (THIS WAS CAUSING YOUR ERRORS)
 */
export interface RecognitionQueue {
  stripeAwards: RecognitionQueueItem[];
  certificates: RecognitionQueueItem[];
  testing: RecognitionQueueItem[];
  promotions: RecognitionQueueItem[];
  ceremonies: RecognitionQueueItem[];
}

export interface RecognitionHistoryEntry {
  type: RecognitionType;
  tier: number;
  stripe?: number;
  date: string;
  coach?: string;
}