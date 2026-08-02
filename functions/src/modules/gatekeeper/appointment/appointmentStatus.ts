import {
  DocumentReference
} from "firebase-admin/firestore";

export async function markConfirmationFailed(
  ref: DocumentReference,
  message: string
): Promise<void> {
  await ref.update({
    appointmentConfirmationStatus:
      "failed",

    appointmentConfirmationError:
      message,

    appointmentConfirmationFailedAt:
      new Date()
  });
}

export async function markConfirmationSent(
  ref: DocumentReference,
  emailId: string
): Promise<void> {
  await ref.update({
    appointmentConfirmationStatus:
      "sent",

    appointmentConfirmationSentAt:
      new Date(),

    appointmentConfirmationError:
      "",

    appointmentEmailId:
      emailId
  });
}
