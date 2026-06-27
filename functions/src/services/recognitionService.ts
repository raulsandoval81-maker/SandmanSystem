import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  awardRecognition,
  AwardRecognitionRequest
} from "../engines/recognition-engine/awardRecognition";

export interface PersistRecognitionRequest extends AwardRecognitionRequest {
  athleteUid: string;
}

export async function persistRecognitionAward(
  request: PersistRecognitionRequest
) {
  if (!request.athleteUid) {
    throw new Error("Missing athleteUid.");
  }

  const db = getFirestore();
  const athleteRef = db.collection("athletes").doc(request.athleteUid);

  const event = awardRecognition(request);

  await athleteRef.update({
    recognitionHistory: FieldValue.arrayUnion(event),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    athleteUid: request.athleteUid,
    event
  };
}