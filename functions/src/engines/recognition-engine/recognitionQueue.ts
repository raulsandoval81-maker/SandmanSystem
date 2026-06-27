import { RecognitionDecision } from "./recognitionTypes";

export function buildRecognitionQueue(
  decisions: RecognitionDecision[]
): RecognitionDecision[] {
  return decisions.filter((d) => d.eligible && !d.completed);
}