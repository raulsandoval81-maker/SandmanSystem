"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposalCheckout = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const stripeClient_1 = require("../billing/stripeClient");
const proposalAccess_1 = require("./proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
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
    const actorUid = req.auth.uid;
    await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
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
    if (cleanString(proposal.status) !==
        "READY_FOR_CHECKOUT") {
        throw new https_1.HttpsError("failed-precondition", "Only READY_FOR_CHECKOUT proposals may begin checkout.");
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
            payment_method_types: ["card"],
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
        }, {
            idempotencyKey: `proposal-checkout-${proposalId}`,
        });
        if (!session.url) {
            throw new Error("Stripe did not return a Checkout Session URL.");
        }
        await db.runTransaction(async (tx) => {
            const currentSnap = await tx.get(proposalRef);
            if (!currentSnap.exists) {
                throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
            }
            const currentProposal = currentSnap.data() || {};
            const currentStatus = cleanString(currentProposal.status);
            const currentSessionId = cleanString(currentProposal
                .pendingCheckoutSessionId);
            if (currentStatus ===
                "CHECKOUT_CREATED" &&
                currentSessionId === session.id) {
                return;
            }
            if (currentStatus !==
                "READY_FOR_CHECKOUT") {
                throw new https_1.HttpsError("failed-precondition", `Proposal ${proposalId} is no longer ready for checkout.`);
            }
            const historyRef = proposalRef
                .collection("history")
                .doc();
            tx.update(proposalRef, {
                status: "CHECKOUT_CREATED",
                pendingCheckoutSessionId: session.id,
                checkoutStartedAt: firestore_1.FieldValue.serverTimestamp(),
                checkoutStartedBy: actorUid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedBy: actorUid,
            });
            tx.create(historyRef, {
                proposalId,
                event: "STATUS_CHANGED",
                fromStatus: "READY_FOR_CHECKOUT",
                toStatus: "CHECKOUT_CREATED",
                createdBy: actorUid,
                createdByName: cleanString(snapshot.coach &&
                    typeof snapshot.coach ===
                        "object"
                    ? snapshot.coach.name
                    : "") || null,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        return {
            ok: true,
            proposalId,
            status: "CHECKOUT_CREATED",
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
