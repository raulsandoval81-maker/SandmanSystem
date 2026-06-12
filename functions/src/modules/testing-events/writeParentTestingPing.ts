import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { TestingEventPayload } from "./testingEventTypes";

export async function writeParentTestingPing(
  payload: TestingEventPayload
) {
  const db = getFirestore();

  if (!payload.parentUid) {
    return null;
  }

  let title = "Testing Update";
  let message = "There is an update regarding your athlete.";

  switch (payload.type) {
    case "TEST_SCHEDULED":
      title = "Testing Scheduled";
      message =
        `Your athlete has been scheduled for testing on ${payload.scheduledDate ?? "a future date"}.`;
      break;

    case "TEST_STARTED":
      title = "Testing Started";
      message =
        "Your athlete has begun the testing process.";
      break;

    case "TEST_PASSED":
      title = "Testing Passed";
      message =
        "Congratulations. Your athlete successfully passed testing.";
      break;

    case "PROMOTED":
      title = "Promotion Earned";
      message =
        `Congratulations. Your athlete advanced to ${payload.nextTier ?? "the next tier"}.`;
      break;

    case "TEST_FAILED":
      title = "Additional Preparation Required";
      message =
        "Your athlete completed testing. Additional preparation has been assigned before the next attempt.";
      break;
  }

  const docRef = await db.collection("parentInbox").add({
    parentUid: payload.parentUid,

    uid: payload.uid,
    athleteName: payload.publicName ?? null,

    type: payload.type,

    title,
    message,

    read: false,

    createdAt: FieldValue.serverTimestamp()
  });

  return {
    id: docRef.id
  };
}