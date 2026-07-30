import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import Stripe from "stripe";

import { BILLING_COLLECTIONS } from "./billingCollections";
import { normalizeMembershipStatus } from "./membershipStatus";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function stripeId(
  value:
    | string
    | { id: string }
    | null
    | undefined
): string | null {
  if (typeof value === "string") {
    return cleanString(value) || null;
  }

  return cleanString(value?.id) || null;
}

export interface SubscriptionSyncResult {
  familyId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  membershipStatus: ReturnType<
    typeof normalizeMembershipStatus
  >;
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  eventType: string
): Promise<SubscriptionSyncResult | null> {
  const familyId =
    cleanString(subscription.metadata?.familyId);

  if (!familyId) {
    console.warn(
      "[syncStripeSubscription] Missing familyId:",
      {
        subscriptionId: subscription.id,
        eventType,
      }
    );

    return null;
  }

  const stripeCustomerId =
    stripeId(subscription.customer);

  const firstItem =
    subscription.items.data[0];

  const stripePriceId =
    firstItem?.price?.id || null;

  const currentPeriodEnd =
    firstItem?.current_period_end
      ? new Date(
          firstItem.current_period_end * 1000
        ).toISOString()
      : null;

const membershipStatus =
  normalizeMembershipStatus(
    subscription.status
  );
  
  const db = getFirestore();

  const familyRef =
    db
      .collection(BILLING_COLLECTIONS.families)
      .doc(familyId);

  const membershipRef =
    db
      .collection(
        BILLING_COLLECTIONS.memberships
      )
      .doc(familyId);

  const now =
    FieldValue.serverTimestamp();

  const batch = db.batch();

  batch.set(
    familyRef,
    {
      stripeCustomerId,

      "billing.stripeCustomerId":
        stripeCustomerId,

      "billing.stripeSubscriptionId":
        subscription.id,

      "billing.stripePriceId":
        stripePriceId,

      "billing.stripeSubscriptionStatus":
        subscription.status,

      "billing.membershipStatus":
        membershipStatus,

      "billing.currentPeriodEnd":
        currentPeriodEnd,

      "billing.cancelAtPeriodEnd":
        subscription.cancel_at_period_end,

      "billing.lastStripeEventType":
        eventType,

      "billing.lastStripeEventAt":
        now,

      updatedAt:
        now,
    },
    { merge: true }
  );

  batch.set(
    membershipRef,
    {
      familyId,

      stripeCustomerId,
      stripeSubscriptionId:
        subscription.id,
      stripePriceId,

      membershipStatus,

      stripeSubscriptionStatus:
        subscription.status,

      currentPeriodEnd,

      cancelAtPeriodEnd:
        subscription.cancel_at_period_end,

      lastStripeEventType:
        eventType,

      lastStripeEventAt:
        now,

      updatedAt:
        now,

      createdAt:
        now,
    },
    { merge: true }
  );

  await batch.commit();

  return {
    familyId,
    stripeCustomerId,
    stripeSubscriptionId:
      subscription.id,
    membershipStatus,
  };
}
