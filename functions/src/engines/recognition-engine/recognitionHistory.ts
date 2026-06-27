import { RecognitionHistoryEntry } from "./recognitionTypes";

export function getRecognitionHistory(athlete: any): RecognitionHistoryEntry[] {
  return athlete.recognitionHistory || [];
}

export function hasRecognition(
  athlete: any,
  type: string,
  tier: number,
  stripe?: number
): boolean {
  return getRecognitionHistory(athlete).some((entry) => {
    return (
      entry.type === type &&
      Number(entry.tier) === Number(tier) &&
      Number(entry.stripe || 0) === Number(stripe || 0)
    );
  });
}