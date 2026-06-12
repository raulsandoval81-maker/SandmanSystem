import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  TestingEventType,
  TestingEventPayload
} from "./testingEventTypes";

export async function createTestingEvent(
  payload: TestingEventPayload
) {
  const db = getFirestore();

  const event = {
    uid: payload.uid,
    type: payload.type,

    score: payload.score ?? null,

    tier: payload.tier ?? null,
    nextTier: payload.nextTier ?? null,

    scheduledDate: payload.scheduledDate ?? null,

    coachUid: payload.coachUid ?? null,
    parentUid: payload.parentUid ?? null,

    publicName: payload.publicName ?? null,

    createdAt: FieldValue.serverTimestamp()
  };

  const ref = await db.collection("testingEvents").add(event);

  return {
    id: ref.id,
    ...event
  };
}