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
export interface RecognitionHistoryEntry {
  type: RecognitionType;
  tier: number;
  stripe?: number;
  date: string;
  coach?: string;
}