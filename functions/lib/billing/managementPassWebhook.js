"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertManagementPassPayment = assertManagementPassPayment;
exports.processManagementPassCheckoutCompleted = processManagementPassCheckoutCompleted;
exports.handleManagementPassCheckoutCompleted = handleManagementPassCheckoutCompleted;
const firestore_1 = require("firebase-admin/firestore");
const stripeClient_1 = require("./stripeClient");
const managementPassCheckoutPolicy_1 = require("../modules/management/managementPassCheckoutPolicy");
const clean = (value) => String(value ?? "").trim();
function stripeId(value) {
    return typeof value === "string" ? value : clean(value?.id);
}
function assertManagementPassPayment(session, message, messageId) {
    if (clean(session.metadata?.paymentFlow) !== "management_pass") {
        throw new Error("Checkout is not a Management pass payment.");
    }
    const passType = clean(message.passType);
    const pass = managementPassCheckoutPolicy_1.PASS_PRICES[passType];
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
async function processManagementPassCheckoutCompleted(session, deps) {
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
    if (!message)
        throw new Error(`Management pass message ${messageId} was not found.`);
    const state = assertManagementPassPayment(session, message, messageId);
    if (state === "already_paid")
        return { paid: true, duplicate: true, messageId };
    const paymentIntentId = stripeId(session.payment_intent);
    const payment = await deps.retrievePaymentIntent(paymentIntentId);
    if (payment.id !== paymentIntentId || payment.status !== "succeeded"
        || payment.currency !== "usd" || payment.amountReceived !== session.amount_total) {
        throw new Error("Stripe PaymentIntent does not confirm the pass payment.");
    }
    await deps.markPaid(messageId, session, payment);
    return { paid: true, duplicate: false, messageId };
}
async function handleManagementPassCheckoutCompleted(session) {
    const db = (0, firestore_1.getFirestore)();
    const deps = {
        loadMessage: async (messageId) => {
            const snap = await db.collection("general_messages").doc(messageId).get();
            return snap.exists ? snap.data() || {} : null;
        },
        retrievePaymentIntent: async (paymentIntentId) => {
            const intent = await (0, stripeClient_1.getStripe)().paymentIntents.retrieve(paymentIntentId, {
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
                if (!snap.exists)
                    throw new Error(`Management pass message ${messageId} was not found.`);
                const state = assertManagementPassPayment(paidSession, snap.data() || {}, messageId);
                if (state === "already_paid")
                    return;
                const customerId = stripeId(paidSession.customer);
                tx.update(ref, {
                    passPaymentStatus: "paid",
                    passPaidAt: firestore_1.FieldValue.serverTimestamp(),
                    stripePaymentIntentId: payment.id,
                    ...(customerId ? { stripeCustomerId: customerId } : {}),
                    ...(payment.receiptUrl ? { stripeReceiptUrl: payment.receiptUrl } : {}),
                    paymentUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            });
        },
    };
    return processManagementPassCheckoutCompleted(session, deps);
}
