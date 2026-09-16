import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type Stripe from "stripe";
import { getStripe, STRIPE_SECRET_KEY } from "../../billing/stripeClient";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../../services/staffAuthorization";
import { assertPassCheckoutRequest, assertPassPrice } from "./managementPassCheckoutPolicy";

type Actor = Awaited<ReturnType<typeof requireActiveStaff>>;
type Message = Record<string, any>;

export type PassCheckoutDependencies = {
  loadActor(uid: string): Promise<Actor>;
  loadMessage(messageId: string): Promise<Message | null>;
  listPrices(lookupKey: string): Promise<Array<Record<string, any>>>;
  retrieveSession(sessionId: string): Promise<{ id: string; status: string | null; url: string | null }>;
  createSession(params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string): Promise<{ id: string; url: string | null }>;
  savePending(input: {
    messageId: string;
    actor: Actor;
    confirmedPayerEmail: string;
    sessionId: string;
    priceId: string;
    lookupKey: string;
    amountCents: number;
  }): Promise<void>;
};

const clean = (value: unknown) => String(value ?? "").trim();

export async function runManagementPassCheckout(
  input: { authUid?: string; messageId?: string; publicBaseUrl: string },
  deps: PassCheckoutDependencies
) {
  if (!input.authUid) throw new HttpsError("unauthenticated", "Management authentication required.");
  const messageId = clean(input.messageId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
    throw new HttpsError("invalid-argument", "A valid messageId is required.");
  }
  const actor = await deps.loadActor(input.authUid);
  const message = await deps.loadMessage(messageId);
  if (!message) throw new HttpsError("not-found", "Pass request not found.");
  const { locationId, passType, pass, payerEmail } =
    assertPassCheckoutRequest(message, actor, message.email);

  const existingId = clean(message.stripeCheckoutSessionId);
  if (existingId) {
    if (clean(message.passPriceLookupKey) !== pass.lookupKey
        || clean(message.passPayerEmail).toLowerCase() !== payerEmail) {
      throw new HttpsError("failed-precondition", "Existing checkout does not match this pass request.");
    }
    const existing = await deps.retrieveSession(existingId);
    if (existing.status !== "open" || !existing.url) {
      throw new HttpsError("failed-precondition", "Existing checkout is no longer open; payment status requires review.");
    }
    return {
      checkoutUrl: existing.url,
      checkoutSessionId: existing.id,
      paymentStatus: "pending",
      amountCents: pass.amountCents,
      currency: "usd",
    };
  }

  const price = assertPassPrice(await deps.listPrices(pass.lookupKey), pass.lookupKey, pass.amountCents);
  const baseUrl = input.publicBaseUrl.replace(/\/+$/, "");
  const metadata = { paymentFlow: "management_pass", messageId, locationId, passType };
  const session = await deps.createSession({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: payerEmail,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: messageId,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${baseUrl}/connect/thanks/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/connect/message.html`,
  }, `management-pass-${messageId}`);
  if (!session.id || !session.url) {
    throw new HttpsError("internal", "Stripe did not return an open Checkout Session.");
  }
  await deps.savePending({
    messageId, actor, confirmedPayerEmail: payerEmail,
    sessionId: session.id, priceId: price.id, lookupKey: pass.lookupKey,
    amountCents: pass.amountCents,
  });
  return {
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
    paymentStatus: "pending",
    amountCents: pass.amountCents,
    currency: "usd",
  };
}

export const createManagementPassCheckout = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const db = getFirestore();
    const deps: PassCheckoutDependencies = {
      loadActor: (uid) => requireActiveStaff(uid, MANAGEMENT_STAFF_ROLES, "Active Management or Admin access required."),
      loadMessage: async (messageId) => {
        const snap = await db.collection("general_messages").doc(messageId).get();
        return snap.exists ? snap.data() || {} : null;
      },
      listPrices: async (lookupKey) => {
        const result = await getStripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 100 });
        if (result.has_more) throw new HttpsError("failed-precondition", "Stripe returned too many matching prices.");
        return result.data;
      },
      retrieveSession: async (sessionId) => getStripe().checkout.sessions.retrieve(sessionId),
      createSession: (params, idempotencyKey) => getStripe().checkout.sessions.create(params, { idempotencyKey }),
      savePending: async ({ messageId, actor, confirmedPayerEmail, sessionId, priceId, lookupKey, amountCents }) => {
        const ref = db.collection("general_messages").doc(messageId);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new HttpsError("not-found", "Pass request not found.");
          const current = snap.data() || {};
          const validated = assertPassCheckoutRequest(current, actor, confirmedPayerEmail);
          if (validated.pass.lookupKey !== lookupKey || validated.pass.amountCents !== amountCents) {
            throw new HttpsError("failed-precondition", "Pass request changed during checkout.");
          }
          const linkedId = clean(current.stripeCheckoutSessionId);
          if (linkedId && linkedId !== sessionId) {
            throw new HttpsError("failed-precondition", "A different Checkout Session is already linked.");
          }
          if (!linkedId) tx.update(ref, {
            passPaymentStatus: "pending",
            passAmountCents: amountCents,
            passCurrency: "usd",
            passPriceLookupKey: lookupKey,
            passPayerEmail: confirmedPayerEmail,
            stripeCheckoutSessionId: sessionId,
            stripePriceId: priceId,
            paymentCreatedAt: FieldValue.serverTimestamp(),
            paymentCreatedBy: actor.uid,
          });
        });
      },
    };
    return runManagementPassCheckout({
      authUid: request.auth?.uid,
      messageId: request.data?.messageId,
      publicBaseUrl: clean(process.env.SANDMAN_PUBLIC_BASE_URL) || "https://www.sandmancombat.com",
    }, deps);
  }
);
