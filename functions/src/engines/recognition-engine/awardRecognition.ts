import type { RecognitionHistoryEntry } from "./recognitionTypes";

export interface AwardRecognitionRequest {
  athleteUid: string;
  coachUid?: string;
  type: RecognitionHistoryEntry["type"];
  tier: number;
  stripe?: number;
}

export function awardRecognition(
  request: AwardRecognitionRequest
): RecognitionHistoryEntry {
  return {
    type: request.type,
    tier: request.tier,
    stripe: request.stripe,
    date: new Date().toISOString(),
    coach: request.coachUid
  };
}