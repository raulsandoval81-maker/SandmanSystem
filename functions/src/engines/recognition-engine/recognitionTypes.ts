export type RecognitionType =
  | "NONE"
  | "STRIPE"
  | "CERTIFICATE"
  | "TESTING"
  | "PROMOTION"
  | "CEREMONY";

export interface RecognitionDecision {
  type: RecognitionType;
  eligible: boolean;
  pending: boolean;
  completed: boolean;
  message: string;
}

export interface RecognitionHistoryEntry {
  type: RecognitionType;
  tier: number;
  stripe?: number;
  date: string;
  coach?: string;
}