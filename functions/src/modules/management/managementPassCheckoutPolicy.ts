import { HttpsError } from "firebase-functions/v2/https";
import {
  normalizeStaffRole,
  requireStaffLocation,
} from "../../services/staffAuthorization";

export const PASS_PRICES = Object.freeze({
  "combat-dropin-1day": {
    lookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
    amountCents: 2500,
  },
  "combat-dropin-2day": {
    lookupKey: "sandman_academy-2026-v3_combat_dropin_2day",
    amountCents: 4000,
  },
  "fitness-dropin": {
    lookupKey: "sandman_academy-2026-v3_fitness_dropin",
    amountCents: 1500,
  },
});

const clean = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => clean(value).toLowerCase();

export function assertPassCheckoutRequest(
  message: Record<string, any>,
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  confirmedPayerEmail: unknown
) {
  const { locationId, passType, pass } = assertManagementPassMessage(message, actor);
  const payerEmail = email(message.email);
  if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)
      || email(confirmedPayerEmail) !== payerEmail) {
    throw new HttpsError("failed-precondition", "Confirm the payer email on this request.");
  }
  if (clean(message.passPaymentStatus).toLowerCase() === "paid") {
    throw new HttpsError("failed-precondition", "This pass has already been paid.");
  }
  if (!message.passAttendanceConfirmedAt) {
    throw new HttpsError("failed-precondition", "Confirm attendance before collecting payment.");
  }
  return { locationId, passType, pass, payerEmail };
}

export function assertManagementPassMessage(
  message: Record<string, any>,
  actor: { uid: string; role: string; staff: Record<string, unknown> }
) {
  if (clean(message.topic) !== "request-pass") {
    throw new HttpsError("failed-precondition", "This message is not a pass request.");
  }
  const locationId = requireStaffLocation(actor, message.locationId);
  const passType = clean(message.passType);
  const pass = PASS_PRICES[passType as keyof typeof PASS_PRICES];
  if (!pass) throw new HttpsError("failed-precondition", "Unsupported pass type.");
  if ([message.status, message.messageStatus, message.routingStage]
    .some((value) => clean(value).toUpperCase() === "CLOSED")) {
    throw new HttpsError("failed-precondition", "A closed message cannot start payment.");
  }
  if (normalizeStaffRole(actor.role) === "management") {
    const assigned = clean(message.assignedManagerUid) === actor.uid;
    const pending = !clean(message.assignedManagerUid)
      && clean(message.assignmentStatus) === "PENDING_MANAGEMENT";
    if (!assigned && !pending) {
      throw new HttpsError("permission-denied", "This pass request is outside your Management queue.");
    }
  }
  return { locationId, passType, pass };
}

export function assertPassPrice(prices: Array<Record<string, any>>, lookupKey: string, amountCents: number) {
  if (prices.length !== 1) {
    throw new HttpsError("failed-precondition", "Exactly one active Stripe pass price is required.");
  }
  const price = prices[0];
  if (price.active !== true || price.lookup_key !== lookupKey
      || price.currency !== "usd" || price.type !== "one_time"
      || price.recurring != null || price.unit_amount !== amountCents) {
    throw new HttpsError("failed-precondition", "Stripe pass price does not match the approved catalog.");
  }
  return price;
}
