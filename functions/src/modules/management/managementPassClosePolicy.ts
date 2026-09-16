import * as functions from "firebase-functions";

const clean = (value: unknown) => String(value ?? "").trim();

export function assertPassReadyToClose(message: Record<string, any>): void {
  if (clean(message.topic) !== "request-pass") return;
  if (!message.passAttendanceConfirmedAt || clean(message.passPaymentStatus) !== "paid"
      || !clean(message.stripePaymentIntentId)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Confirm attendance and wait for verified payment before closing this pass request."
    );
  }
}

export function passIntelligenceSummary(message: Record<string, any>) {
  if (clean(message.topic) !== "request-pass") return {};
  return {
    passAttendanceConfirmedAt: message.passAttendanceConfirmedAt,
    passAttendanceConfirmedBy: clean(message.passAttendanceConfirmedBy) || null,
    passPaymentStatus: "paid",
    passAmountCents: message.passAmountCents ?? null,
    passCurrency: clean(message.passCurrency) || null,
    passPaidAt: message.passPaidAt || null,
    stripeCheckoutSessionId: clean(message.stripeCheckoutSessionId) || null,
    stripePaymentIntentId: clean(message.stripePaymentIntentId),
    ...(clean(message.stripeReceiptUrl) ? { stripeReceiptUrl: clean(message.stripeReceiptUrl) } : {}),
  };
}
