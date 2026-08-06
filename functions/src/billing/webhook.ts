import { onRequest } from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import Stripe from "stripe";

import {
  getStripe,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} from "./stripeClient";

import { BILLING_COLLECTIONS } from "./billingCollections";

import {
  syncStripeSubscription,
} from "./subscriptions";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function getFamilyIdFromObject(
  object: Stripe.Event.Data.Object
): string {
  const possibleObject =
    object as unknown as {
      metadata?: Record<string, string>;
      client_reference_id?: string | null;
    };

  return cleanString(
    possibleObject.metadata?.familyId ||
    possibleObject.client_reference_id
  );
}

function getObjectId(
  object: Stripe.Event.Data.Object
): string | null {
  const possibleObject =
    object as unknown as {
      id?: string;
    };

  return cleanString(possibleObject.id) || null;
}

async function recordBillingEvent(
  event: Stripe.Event,
  familyId: string | null
): Promise<void> {
  const db = getFirestore();

  await db
    .collection(BILLING_COLLECTIONS.billingEvents)
    .doc(event.id)
    .set(
      {
        stripeEventId: event.id,
        type: event.type,
        familyId,
        stripeObjectId:
          getObjectId(event.data.object),

        livemode: event.livemode,
        apiVersion: event.api_version || null,

        processed: true,
        processedAt:
          FieldValue.serverTimestamp(),

        createdAt:
          FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function eventAlreadyProcessed(
  eventId: string
): Promise<boolean> {
  const db = getFirestore();

  const eventSnap =
    await db
      .collection(BILLING_COLLECTIONS.billingEvents)
      .doc(eventId)
      .get();

  return (
    eventSnap.exists &&
    eventSnap.data()?.processed === true
  );
}

async function handleProposalCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const proposalId =
    cleanString(session.metadata?.proposalId);

  if (!proposalId) {
    return null;
  }

  if (
    cleanString(session.metadata?.source) !==
    "admissions_proposal"
  ) {
    console.warn(
      "[stripeWebhook] Proposal checkout has unexpected source:",
      {
        proposalId,
        sessionId: session.id,
      }
    );

    return null;
  }

  if (session.payment_status !== "paid") {
    console.warn(
      "[stripeWebhook] Proposal checkout completed without confirmed payment:",
      {
        proposalId,
        sessionId: session.id,
        paymentStatus: session.payment_status,
      }
    );

    return proposalId;
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || null;

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || null;

  const db = getFirestore();

  const proposalRef =
    db
      .collection("proposals")
      .doc(proposalId);

  await db.runTransaction(
    async (tx) => {
      const proposalSnap =
        await tx.get(proposalRef);

      if (!proposalSnap.exists) {
        throw new Error(
          `Proposal ${proposalId} was not found.`
        );
      }

      const proposal =
        proposalSnap.data() || {};

      const currentStatus =
        cleanString(proposal.status);

      if (currentStatus === "PAID") {
        return;
      }

if (currentStatus !== "CHECKOUT_CREATED") {
  throw new Error(
    `Proposal ${proposalId} must be CHECKOUT_CREATED before payment.`
  );
}

const pendingCheckoutSessionId =
  cleanString(
    proposal.pendingCheckoutSessionId
  );

if (
  !pendingCheckoutSessionId ||
  pendingCheckoutSessionId !== session.id
) {
  throw new Error(
    `Stripe Checkout Session ${session.id} does not match proposal ${proposalId}.`
  );
}
      const historyRef =
        proposalRef
          .collection("history")
          .doc();

      tx.update(
        proposalRef,
        {
          status:
            "PAID",

          stripeCheckoutSessionId:
            session.id,

          stripeCustomerId,
          stripeSubscriptionId,

          paymentStatus:
            session.payment_status,

          paidAt:
            FieldValue.serverTimestamp(),

          pendingCheckoutSessionId:
            FieldValue.delete(),

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      tx.create(
        historyRef,
        {
          proposalId,

          event:
            "STATUS_CHANGED",

fromStatus:
  "CHECKOUT_CREATED",

          toStatus:
            "PAID",

          createdBy:
            "stripe",

          createdByName:
            "Stripe Webhook",

          stripeCheckoutSessionId:
            session.id,

          createdAt:
            FieldValue.serverTimestamp(),
        }
      );
    }
  );

  return proposalId;
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const familyId =
    cleanString(
      session.metadata?.familyId ||
      session.client_reference_id
    );

  if (!familyId) {
    console.warn(
      "[stripeWebhook] Checkout completed without familyId:",
      session.id
    );

    return null;
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || null;

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || null;

  const db = getFirestore();

  const familyRef =
    db
      .collection(BILLING_COLLECTIONS.families)
      .doc(familyId);

  await familyRef.set(
    {
      stripeCustomerId,

      billing: {
        stripeCustomerId,
        stripeSubscriptionId,

        membershipStatus: "pending",

        checkoutCompletedAt:
          FieldValue.serverTimestamp(),

        pendingCheckoutSessionId:
          FieldValue.delete(),

        lastStripeEventType:
          "checkout.session.completed",

        lastStripeEventAt:
          FieldValue.serverTimestamp(),
      },

      updatedAt:
        FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return familyId;
}

async function handleSubscriptionChanged(
  subscription: Stripe.Subscription,
  eventType: string
): Promise<string | null> {
  const result =
    await syncStripeSubscription(
      subscription,
      eventType
    );

  return result?.familyId ?? null;
}

async function handleInvoiceEvent(
  invoice: Stripe.Invoice,
  eventType: string
): Promise<string | null> {
  const subscriptionDetails =
    invoice.parent?.subscription_details;

  const familyId =
    cleanString(
      invoice.metadata?.familyId ||
      subscriptionDetails?.metadata?.familyId
    );

  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id || null;

  const db = getFirestore();

  if (!familyId) {
    console.warn(
      "[stripeWebhook] Invoice event without familyId:",
      invoice.id
    );

    return null;
  }

  const familyRef =
    db
      .collection(BILLING_COLLECTIONS.families)
      .doc(familyId);

  const paymentSucceeded =
    eventType === "invoice.payment_succeeded";

  await familyRef.set(
    {
      stripeCustomerId,

      billing: {
        stripeCustomerId,

        lastInvoiceId:
          invoice.id,

        lastInvoiceStatus:
          invoice.status || null,

        lastPaymentSucceeded:
          paymentSucceeded,

        lastPaymentAt:
          paymentSucceeded
            ? FieldValue.serverTimestamp()
            : null,

        lastPaymentFailureAt:
          paymentSucceeded
            ? null
            : FieldValue.serverTimestamp(),

        lastStripeEventType:
          eventType,

        lastStripeEventAt:
          FieldValue.serverTimestamp(),
      },

      updatedAt:
        FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return familyId;
}

export const stripeBillingWebhook =
  onRequest(
    {
      secrets: [
        STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET,
      ],
    },
    async (req, res) => {
if (req.method !== "POST") {
      res
        .status(405)
        .send("Method Not Allowed");

      return;
    }

const webhookSecret =
  STRIPE_WEBHOOK_SECRET.value();
    if (!webhookSecret) {
      console.error(
        "[stripeBillingWebhook] Missing STRIPE_WEBHOOK_SECRET"
      );

      res
        .status(500)
        .send("Webhook configuration error");

      return;
    }

    const signature =
      req.headers["stripe-signature"];

    if (!signature) {
      res
        .status(400)
        .send("Missing Stripe signature");

      return;
    }

    let event: Stripe.Event;

    try {
      event =
        getStripe().webhooks.constructEvent(
          req.rawBody,
          signature,
          webhookSecret
        );
    } catch (error) {
      console.error(
        "[stripeBillingWebhook] Invalid signature:",
        error
      );

      res
        .status(400)
        .send("Invalid webhook signature");

      return;
    }

    try {
      const alreadyProcessed =
        await eventAlreadyProcessed(event.id);

      if (alreadyProcessed) {
        res.status(200).json({
          received: true,
          duplicate: true,
          eventId: event.id,
        });

        return;
      }

      let familyId: string | null = null;

      switch (event.type) {
        case "checkout.session.completed": {
          const session =
            event.data.object as Stripe.Checkout.Session;

          const proposalId =
            cleanString(
              session.metadata?.proposalId
            );

          if (proposalId) {
            await handleProposalCheckoutCompleted(
              session
            );

            familyId = null;
          } else {
            familyId =
              await handleCheckoutCompleted(
                session
              );
          }

          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          familyId =
            await handleSubscriptionChanged(
              event.data.object as Stripe.Subscription,
              event.type
            );
          break;

        case "invoice.payment_succeeded":
        case "invoice.payment_failed":
          familyId =
            await handleInvoiceEvent(
              event.data.object as Stripe.Invoice,
              event.type
            );
          break;

        default:
          familyId =
            getFamilyIdFromObject(
              event.data.object
            );

          console.log(
            "[stripeBillingWebhook] Ignored event:",
            event.type
          );
      }

      await recordBillingEvent(
        event,
        familyId
      );

      res.status(200).json({
        received: true,
        eventId: event.id,
        eventType: event.type,
        familyId,
      });
    } catch (error) {
      console.error(
        "[stripeBillingWebhook] Processing failed:",
        {
          eventId: event.id,
          eventType: event.type,
          error,
        }
      );

      res
        .status(500)
        .send("Webhook processing failed");
    }
  }
);
