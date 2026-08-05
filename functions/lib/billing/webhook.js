"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeBillingWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const stripeClient_1 = require("./stripeClient");
const billingCollections_1 = require("./billingCollections");
const subscriptions_1 = require("./subscriptions");
function cleanString(value) {
    return String(value ?? "").trim();
}
function getFamilyIdFromObject(object) {
    const possibleObject = object;
    return cleanString(possibleObject.metadata?.familyId ||
        possibleObject.client_reference_id);
}
function getObjectId(object) {
    const possibleObject = object;
    return cleanString(possibleObject.id) || null;
}
async function recordBillingEvent(event, familyId) {
    const db = (0, firestore_1.getFirestore)();
    await db
        .collection(billingCollections_1.BILLING_COLLECTIONS.billingEvents)
        .doc(event.id)
        .set({
        stripeEventId: event.id,
        type: event.type,
        familyId,
        stripeObjectId: getObjectId(event.data.object),
        livemode: event.livemode,
        apiVersion: event.api_version || null,
        processed: true,
        processedAt: firestore_1.FieldValue.serverTimestamp(),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
async function eventAlreadyProcessed(eventId) {
    const db = (0, firestore_1.getFirestore)();
    const eventSnap = await db
        .collection(billingCollections_1.BILLING_COLLECTIONS.billingEvents)
        .doc(eventId)
        .get();
    return (eventSnap.exists &&
        eventSnap.data()?.processed === true);
}
async function handleProposalCheckoutCompleted(session) {
    const proposalId = cleanString(session.metadata?.proposalId);
    if (!proposalId) {
        return null;
    }
    if (cleanString(session.metadata?.source) !==
        "admissions_proposal") {
        console.warn("[stripeWebhook] Proposal checkout has unexpected source:", {
            proposalId,
            sessionId: session.id,
        });
        return null;
    }
    if (session.payment_status !== "paid") {
        console.warn("[stripeWebhook] Proposal checkout completed without confirmed payment:", {
            proposalId,
            sessionId: session.id,
            paymentStatus: session.payment_status,
        });
        return proposalId;
    }
    const stripeCustomerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || null;
    const stripeSubscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    await db.runTransaction(async (tx) => {
        const proposalSnap = await tx.get(proposalRef);
        if (!proposalSnap.exists) {
            throw new Error(`Proposal ${proposalId} was not found.`);
        }
        const proposal = proposalSnap.data() || {};
        const currentStatus = cleanString(proposal.status);
        if (currentStatus === "PAID") {
            return;
        }
        if (currentStatus !== "LOCKED") {
            throw new Error(`Proposal ${proposalId} must be LOCKED before payment.`);
        }
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            status: "PAID",
            stripeCheckoutSessionId: session.id,
            stripeCustomerId,
            stripeSubscriptionId,
            paymentStatus: session.payment_status,
            paidAt: firestore_1.FieldValue.serverTimestamp(),
            pendingCheckoutSessionId: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "STATUS_CHANGED",
            fromStatus: "LOCKED",
            toStatus: "PAID",
            createdBy: "stripe",
            createdByName: "Stripe Webhook",
            stripeCheckoutSessionId: session.id,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return proposalId;
}
async function handleCheckoutCompleted(session) {
    const familyId = cleanString(session.metadata?.familyId ||
        session.client_reference_id);
    if (!familyId) {
        console.warn("[stripeWebhook] Checkout completed without familyId:", session.id);
        return null;
    }
    const stripeCustomerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || null;
    const stripeSubscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;
    const db = (0, firestore_1.getFirestore)();
    const familyRef = db
        .collection(billingCollections_1.BILLING_COLLECTIONS.families)
        .doc(familyId);
    await familyRef.set({
        stripeCustomerId,
        billing: {
            stripeCustomerId,
            stripeSubscriptionId,
            membershipStatus: "pending",
            checkoutCompletedAt: firestore_1.FieldValue.serverTimestamp(),
            pendingCheckoutSessionId: firestore_1.FieldValue.delete(),
            lastStripeEventType: "checkout.session.completed",
            lastStripeEventAt: firestore_1.FieldValue.serverTimestamp(),
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return familyId;
}
async function handleSubscriptionChanged(subscription, eventType) {
    const result = await (0, subscriptions_1.syncStripeSubscription)(subscription, eventType);
    return result?.familyId ?? null;
}
async function handleInvoiceEvent(invoice, eventType) {
    const subscriptionDetails = invoice.parent?.subscription_details;
    const familyId = cleanString(invoice.metadata?.familyId ||
        subscriptionDetails?.metadata?.familyId);
    const stripeCustomerId = typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id || null;
    const db = (0, firestore_1.getFirestore)();
    if (!familyId) {
        console.warn("[stripeWebhook] Invoice event without familyId:", invoice.id);
        return null;
    }
    const familyRef = db
        .collection(billingCollections_1.BILLING_COLLECTIONS.families)
        .doc(familyId);
    const paymentSucceeded = eventType === "invoice.payment_succeeded";
    await familyRef.set({
        stripeCustomerId,
        billing: {
            stripeCustomerId,
            lastInvoiceId: invoice.id,
            lastInvoiceStatus: invoice.status || null,
            lastPaymentSucceeded: paymentSucceeded,
            lastPaymentAt: paymentSucceeded
                ? firestore_1.FieldValue.serverTimestamp()
                : null,
            lastPaymentFailureAt: paymentSucceeded
                ? null
                : firestore_1.FieldValue.serverTimestamp(),
            lastStripeEventType: eventType,
            lastStripeEventAt: firestore_1.FieldValue.serverTimestamp(),
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return familyId;
}
exports.stripeBillingWebhook = (0, https_1.onRequest)({
    secrets: [
        stripeClient_1.STRIPE_SECRET_KEY,
        stripeClient_1.STRIPE_WEBHOOK_SECRET,
    ],
}, async (req, res) => {
    if (req.method !== "POST") {
        res
            .status(405)
            .send("Method Not Allowed");
        return;
    }
    const webhookSecret = stripeClient_1.STRIPE_WEBHOOK_SECRET.value();
    if (!webhookSecret) {
        console.error("[stripeBillingWebhook] Missing STRIPE_WEBHOOK_SECRET");
        res
            .status(500)
            .send("Webhook configuration error");
        return;
    }
    const signature = req.headers["stripe-signature"];
    if (!signature) {
        res
            .status(400)
            .send("Missing Stripe signature");
        return;
    }
    let event;
    try {
        event =
            (0, stripeClient_1.getStripe)().webhooks.constructEvent(req.rawBody, signature, webhookSecret);
    }
    catch (error) {
        console.error("[stripeBillingWebhook] Invalid signature:", error);
        res
            .status(400)
            .send("Invalid webhook signature");
        return;
    }
    try {
        const alreadyProcessed = await eventAlreadyProcessed(event.id);
        if (alreadyProcessed) {
            res.status(200).json({
                received: true,
                duplicate: true,
                eventId: event.id,
            });
            return;
        }
        let familyId = null;
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const proposalId = cleanString(session.metadata?.proposalId);
                if (proposalId) {
                    await handleProposalCheckoutCompleted(session);
                    familyId = null;
                }
                else {
                    familyId =
                        await handleCheckoutCompleted(session);
                }
                break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                familyId =
                    await handleSubscriptionChanged(event.data.object, event.type);
                break;
            case "invoice.payment_succeeded":
            case "invoice.payment_failed":
                familyId =
                    await handleInvoiceEvent(event.data.object, event.type);
                break;
            default:
                familyId =
                    getFamilyIdFromObject(event.data.object);
                console.log("[stripeBillingWebhook] Ignored event:", event.type);
        }
        await recordBillingEvent(event, familyId);
        res.status(200).json({
            received: true,
            eventId: event.id,
            eventType: event.type,
            familyId,
        });
    }
    catch (error) {
        console.error("[stripeBillingWebhook] Processing failed:", {
            eventId: event.id,
            eventType: event.type,
            error,
        });
        res
            .status(500)
            .send("Webhook processing failed");
    }
});
