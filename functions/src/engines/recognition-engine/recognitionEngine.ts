import { RecognitionDecision } from "./recognitionTypes";

export function evaluateRecognition(athlete: any): RecognitionDecision {

  return {
    type: "NONE",
    eligible: false,
    pending: false,
    completed: false,
    message: "Recognition engine not implemented."
  };

}