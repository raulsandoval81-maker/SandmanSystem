"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManagementPassCheckout = void 0;
exports.runManagementPassCheckout = runManagementPassCheckout;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const stripeClient_1 = require("../../billing/stripeClient");
const staffAuthorization_1 = require("../../services/staffAuthorization");
const managementPassCheckoutPolicy_1 = require("./managementPassCheckoutPolicy");
const clean = (value) => String(value ?? "").trim();
async function runManagementPassCheckout(input, deps) {
    if (!input.authUid)
        throw new https_1.HttpsError("unauthenticated", "Management authentication required.");
    const messageId = clean(input.messageId);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
        throw new https_1.HttpsError("invalid-argument", "A valid messageId is required.");
    }
    const actor = await deps.loadActor(input.authUid);
    const message = await deps.loadMessage(messageId);
    if (!message)
        throw new https_1.HttpsError("not-found", "Pass request not found.");
    const { locationId, passType, pass, payerEmail } = (0, managementPassCheckoutPolicy_1.assertPassCheckoutRequest)(message, actor, message.email);
    const existingId = clean(message.stripeCheckoutSessionId);
    if (existingId) {
        if (clean(message.passPriceLookupKey) !== pass.lookupKey
            || clean(message.passPayerEmail).toLowerCase() !== payerEmail) {
            throw new https_1.HttpsError("failed-precondition", "Existing checkout does not match this pass request.");
        }
        const existing = await deps.retrieveSession(existingId);
        if (existing.status !== "open" || !existing.url) {
            throw new https_1.HttpsError("failed-precondition", "Existing checkout is no longer open; payment status requires review.");
        }
        return {
            checkoutUrl: existing.url,
            checkoutSessionId: existing.id,
            paymentStatus: "pending",
            amountCents: pass.amountCents,
            currency: "usd",
        };
    }
    const price = (0, managementPassCheckoutPolicy_1.assertPassPrice)(await deps.listPrices(pass.lookupKey), pass.lookupKey, pass.amountCents);
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
        throw new https_1.HttpsError("internal", "Stripe did not return an open Checkout Session.");
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
exports.createManagementPassCheckout = (0, https_1.onCall)({ secrets: [stripeClient_1.STRIPE_SECRET_KEY] }, async (request) => {
    const db = (0, firestore_1.getFirestore)();
    const deps = {
        loadActor: (uid) => (0, staffAuthorization_1.requireActiveStaff)(uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management or Admin access required."),
        loadMessage: async (messageId) => {
            const snap = await db.collection("general_messages").doc(messageId).get();
            return snap.exists ? snap.data() || {} : null;
        },
        listPrices: async (lookupKey) => {
            const result = await (0, stripeClient_1.getStripe)().prices.list({ lookup_keys: [lookupKey], active: true, limit: 100 });
            if (result.has_more)
                throw new https_1.HttpsError("failed-precondition", "Stripe returned too many matching prices.");
            return result.data;
        },
        retrieveSession: async (sessionId) => (0, stripeClient_1.getStripe)().checkout.sessions.retrieve(sessionId),
        createSession: (params, idempotencyKey) => (0, stripeClient_1.getStripe)().checkout.sessions.create(params, { idempotencyKey }),
        savePending: async ({ messageId, actor, confirmedPayerEmail, sessionId, priceId, lookupKey, amountCents }) => {
            const ref = db.collection("general_messages").doc(messageId);
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists)
                    throw new https_1.HttpsError("not-found", "Pass request not found.");
                const current = snap.data() || {};
                const validated = (0, managementPassCheckoutPolicy_1.assertPassCheckoutRequest)(current, actor, confirmedPayerEmail);
                if (validated.pass.lookupKey !== lookupKey || validated.pass.amountCents !== amountCents) {
                    throw new https_1.HttpsError("failed-precondition", "Pass request changed during checkout.");
                }
                const linkedId = clean(current.stripeCheckoutSessionId);
                if (linkedId && linkedId !== sessionId) {
                    throw new https_1.HttpsError("failed-precondition", "A different Checkout Session is already linked.");
                }
                if (!linkedId)
                    tx.update(ref, {
                        passPaymentStatus: "pending",
                        passAmountCents: amountCents,
                        passCurrency: "usd",
                        passPriceLookupKey: lookupKey,
                        passPayerEmail: confirmedPayerEmail,
                        stripeCheckoutSessionId: sessionId,
                        stripePriceId: priceId,
                        paymentCreatedAt: firestore_1.FieldValue.serverTimestamp(),
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
});
