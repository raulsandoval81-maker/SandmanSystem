"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncStripeSubscription = syncStripeSubscription;
const firestore_1 = require("firebase-admin/firestore");
const billingCollections_1 = require("./billingCollections");
const membershipStatus_1 = require("./membershipStatus");
function cleanString(value) {
    return String(value ?? "").trim();
}
function stripeId(value) {
    if (typeof value === "string") {
        return cleanString(value) || null;
    }
    return cleanString(value?.id) || null;
}
async function syncStripeSubscription(subscription, eventType) {
    const familyId = cleanString(subscription.metadata?.familyId);
    if (!familyId) {
        console.warn("[syncStripeSubscription] Missing familyId:", {
            subscriptionId: subscription.id,
            eventType,
        });
        return null;
    }
    const stripeCustomerId = stripeId(subscription.customer);
    const firstItem = subscription.items.data[0];
    const stripePriceId = firstItem?.price?.id || null;
    const currentPeriodEnd = firstItem?.current_period_end
        ? new Date(firstItem.current_period_end * 1000).toISOString()
        : null;
    const membershipStatus = (0, membershipStatus_1.normalizeMembershipStatus)(subscription.status);
    const db = (0, firestore_1.getFirestore)();
    const familyRef = db
        .collection(billingCollections_1.BILLING_COLLECTIONS.families)
        .doc(familyId);
    const membershipRef = db
        .collection(billingCollections_1.BILLING_COLLECTIONS.memberships)
        .doc(familyId);
    const now = firestore_1.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(familyRef, {
        stripeCustomerId,
        "billing.stripeCustomerId": stripeCustomerId,
        "billing.stripeSubscriptionId": subscription.id,
        "billing.stripePriceId": stripePriceId,
        "billing.stripeSubscriptionStatus": subscription.status,
        "billing.membershipStatus": membershipStatus,
        "billing.currentPeriodEnd": currentPeriodEnd,
        "billing.cancelAtPeriodEnd": subscription.cancel_at_period_end,
        "billing.lastStripeEventType": eventType,
        "billing.lastStripeEventAt": now,
        updatedAt: now,
    }, { merge: true });
    batch.set(membershipRef, {
        familyId,
        stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId,
        membershipStatus,
        stripeSubscriptionStatus: subscription.status,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        lastStripeEventType: eventType,
        lastStripeEventAt: now,
        updatedAt: now,
        createdAt: now,
    }, { merge: true });
    await batch.commit();
    return {
        familyId,
        stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        membershipStatus,
    };
}
