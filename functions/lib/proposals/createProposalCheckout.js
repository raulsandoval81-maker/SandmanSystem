"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposalCheckout = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const stripeClient_1 = require("../billing/stripeClient");
function cleanString(value) {
    return String(value ?? "").trim();
}
function hasCoachAccess(token) {
    return (token.admin === true ||
        token.coach === true ||
        token.role === "admin" ||
        token.role === "coach");
}
function toCents(value) {
    const dollars = Number(value);
    if (!Number.isFinite(dollars) ||
        dollars < 0) {
        return 0;
    }
    return Math.round(dollars * 100);
}
exports.createProposalCheckout = (0, https_1.onCall)({
    secrets: [stripeClient_1.STRIPE_SECRET_KEY],
}, async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to create proposal checkout.");
    }
    const token = req.auth.token;
    if (!hasCoachAccess(token)) {
        throw new https_1.HttpsError("permission-denied", "Coach or administrator access is required.");
    }
    const proposalId = cleanString(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) {
        throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
    }
    const proposal = proposalSnap.data() || {};
    if (cleanString(proposal.status) !== "LOCKED") {
        throw new https_1.HttpsError("failed-precondition", "Only LOCKED proposals may begin checkout.");
    }
    const snapshot = proposal.lockedSnapshot &&
        typeof proposal.lockedSnapshot === "object"
        ? proposal.lockedSnapshot
        : null;
    if (!snapshot) {
        throw new https_1.HttpsError("failed-precondition", "The locked proposal snapshot is missing.");
    }
    const pricing = snapshot.pricing &&
        typeof snapshot.pricing === "object"
        ? snapshot.pricing
        : {};
    const prospect = snapshot.prospect &&
        typeof snapshot.prospect === "object"
        ? snapshot.prospect
        : {};
    const dueNow = toCents(pricing.dueNow);
    const monthlyBalance = toCents(pricing.monthlyBalance);
    if (monthlyBalance < 50) {
        throw new https_1.HttpsError("failed-precondition", "The locked monthly balance is invalid.");
    }
    const email = cleanString(prospect.email).toLowerCase();
    const publicBaseUrl = cleanString(process.env.SANDMAN_PUBLIC_BASE_URL) || "https://www.sandmancombat.com";
    const lineItems = [];
    if (dueNow > 0) {
        lineItems.push({
            price_data: {
                currency: "usd",
                product_data: {
                    name: `Sandman enrollment — ${proposalId}`,
                },
                unit_amount: dueNow,
            },
            quantity: 1,
        });
    }
    lineItems.push({
        price_data: {
            currency: "usd",
            product_data: {
                name: `Sandman monthly membership — ${proposalId}`,
            },
            recurring: {
                interval: "month",
            },
            unit_amount: monthlyBalance,
        },
        quantity: 1,
    });
    try {
        const stripe = (0, stripeClient_1.getStripe)();
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: lineItems,
            customer_email: email && email.includes("@")
                ? email
                : undefined,
            success_url: `${publicBaseUrl}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${publicBaseUrl}/billing/cancel/`,
            client_reference_id: proposalId,
            metadata: {
                proposalId,
                source: "admissions_proposal",
            },
            subscription_data: {
                metadata: {
                    proposalId,
                    source: "admissions_proposal",
                },
            },
            allow_promotion_codes: false,
        });
        if (!session.url) {
            throw new Error("Stripe did not return a Checkout Session URL.");
        }
        await proposalRef.update({
            pendingCheckoutSessionId: session.id,
            checkoutStartedAt: firestore_1.FieldValue.serverTimestamp(),
            checkoutStartedBy: req.auth.uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy: req.auth.uid,
        });
        return {
            ok: true,
            proposalId,
            status: "LOCKED",
            checkoutSessionId: session.id,
            checkoutUrl: session.url,
        };
    }
    catch (error) {
        console.error("[createProposalCheckout] Failed:", error);
        throw new https_1.HttpsError("internal", error instanceof Error
            ? error.message
            : "Unable to create proposal checkout.");
    }
});
