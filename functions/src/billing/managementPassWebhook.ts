import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getStripe } from "./stripeClient";
import { PASS_PRICES } from "../modules/management/managementPassCheckoutPolicy";

const clean = (value: unknown) => String(value ?? "").trim();

type PassMessage = Record<string, any>;
type PaymentIntentDetails = {
  id: string;
  status: string;
  amountReceived: number;
  currency: string;
  receiptUrl: string | null;
};

export type ManagementPassWebhookDependencies = {
  loadMessage(messageId: string): Promise<PassMessage | null>;
  retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentDetails>;
  markPaid(messageId: string, session: Stripe.Checkout.Session, payment: PaymentIntentDetails): Promise<void>;
};

function stripeId(value: string | { id: string } | null | undefined): string {
  return typeof value === "string" ? value : clean(value?.id);
}

export function assertManagementPassPayment(
  session: Stripe.Checkout.Session,
  message: PassMessage,
  messageId: string
): "pending" | "already_paid" {
  if (clean(session.metadata?.paymentFlow) !== "management_pass") {
    throw new Error("Checkout is not a Management pass payment.");
  }
  const passType = clean(message.passType);
  const pass = PASS_PRICES[passType as keyof typeof PASS_PRICES];
  if (clean(message.topic) !== "request-pass" || !pass) {
    throw new Error("Stored message is not a supported pass request.");
  }
  if (!messageId || clean(session.metadata?.messageId) !== messageId
      || clean(session.client_reference_id) !== messageId
      || clean(message.locationId) === ""
      || clean(session.metadata?.locationId) !== clean(message.locationId)
      || clean(session.metadata?.passType) !== passType
      || clean(message.stripeCheckoutSessionId) !== session.id) {
    throw new Error("Management pass Checkout identity does not match the stored message.");
  }
  if (clean(message.passPriceLookupKey) !== pass.lookupKey
      || !clean(message.stripePriceId)
      || Number(message.passAmountCents) !== pass.amountCents
      || clean(message.passCurrency).toLowerCase() !== "usd"
      || !clean(message.passPayerEmail)
      || !message.paymentCreatedAt
      || !clean(message.paymentCreatedBy)) {
    throw new Error("Stored Management pass payment linkage is incomplete or mismatched.");
  }
  if (session.mode !== "payment" || session.status !== "complete"
      || session.payment_status !== "paid"
      || session.currency !== "usd"
      || session.amount_total !== pass.amountCents
      || !stripeId(session.payment_intent)) {
    throw new Error("Management pass Checkout is not a verified paid one-time payment.");
  }
  const state = clean(message.passPaymentStatus).toLowerCase();
  if (state === "paid") {
    if (clean(message.stripePaymentIntentId) !== stripeId(session.payment_intent)) {
      throw new Error("Stored paid pass has a conflicting PaymentIntent.");
    }
    return "already_paid";
  }
  if (state !== "pending") {
    throw new Error("Management pass payment is not pending.");
  }
  return "pending";
}

export async function processManagementPassCheckoutCompleted(
  session: Stripe.Checkout.Session,
  deps: ManagementPassWebhookDependencies
): Promise<{ paid: boolean; duplicate: boolean; messageId: string | null }> {
  // Checkout completion can precede payment for some methods. Never infer paid
  // from the browser return or from completion alone.
  if (session.status !== "complete" || session.payment_status !== "paid") {
    return { paid: false, duplicate: false, messageId: null };
  }
  const messageId = clean(session.metadata?.messageId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
    throw new Error("Management pass Checkout has no valid messageId.");
  }
  const message = await deps.loadMessage(messageId);
  if (!message) throw new Error(`Management pass message ${messageId} was not found.`);
  const state = assertManagementPassPayment(session, message, messageId);
  if (state === "already_paid") return { paid: true, duplicate: true, messageId };

  const paymentIntentId = stripeId(session.payment_intent);
  const payment = await deps.retrievePaymentIntent(paymentIntentId);
  if (payment.id !== paymentIntentId || payment.status !== "succeeded"
      || payment.currency !== "usd" || payment.amountReceived !== session.amount_total) {
    throw new Error("Stripe PaymentIntent does not confirm the pass payment.");
  }
  await deps.markPaid(messageId, session, payment);
  return { paid: true, duplicate: false, messageId };
}

export async function handleManagementPassCheckoutCompleted(session: Stripe.Checkout.Session) {
  const db = getFirestore();
  const deps: ManagementPassWebhookDependencies = {
    loadMessage: async (messageId) => {
      const snap = await db.collection("general_messages").doc(messageId).get();
      return snap.exists ? snap.data() || {} : null;
    },
    retrievePaymentIntent: async (paymentIntentId) => {
      const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = intent.latest_charge;
      return {
        id: intent.id,
        status: intent.status,
        amountReceived: intent.amount_received,
        currency: intent.currency,
        receiptUrl: charge && typeof charge !== "string" ? charge.receipt_url : null,
      };
    },
    markPaid: async (messageId, paidSession, payment) => {
      const ref = db.collection("general_messages").doc(messageId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error(`Management pass message ${messageId} was not found.`);
        const state = assertManagementPassPayment(paidSession, snap.data() || {}, messageId);
        if (state === "already_paid") return;
        const customerId = stripeId(paidSession.customer);
        tx.update(ref, {
          passPaymentStatus: "paid",
          passPaidAt: FieldValue.serverTimestamp(),
          stripePaymentIntentId: payment.id,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(payment.receiptUrl ? { stripeReceiptUrl: payment.receiptUrl } : {}),
          paymentUpdatedAt: FieldValue.serverTimestamp(),
        });
      });
    },
  };
  return processManagementPassCheckoutCompleted(session, deps);
}
