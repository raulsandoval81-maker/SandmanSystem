"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposalAutopaySetup = void 0;
exports.handleProposalAutopaySetupCompleted = handleProposalAutopaySetupCompleted;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const stripeClient_1 = require("./stripeClient");
const proposalAccess_1 = require("../proposals/proposalAccess");
const lockedRecurringPricing_1 = require("../proposals/lockedRecurringPricing");
const proposalMonthlySponsor_1 = require("./proposalMonthlySponsor");
function cleanString(value) {
    return String(value ?? "").trim();
}
function proposalEmail(proposal) {
    const snapshot = proposal.lockedSnapshot &&
        typeof proposal.lockedSnapshot === "object"
        ? proposal.lockedSnapshot
        : {};
    const prospect = snapshot.prospect &&
        typeof snapshot.prospect === "object"
        ? snapshot.prospect
        : {};
    return cleanString(prospect.email ||
        proposal.prospect?.email ||
        proposal.email).toLowerCase();
}
function proposalName(proposal) {
    const snapshot = proposal.lockedSnapshot &&
        typeof proposal.lockedSnapshot === "object"
        ? proposal.lockedSnapshot
        : {};
    const prospect = snapshot.prospect &&
        typeof snapshot.prospect === "object"
        ? snapshot.prospect
        : {};
    return cleanString(prospect.familyName ||
        prospect.primaryContactName ||
        proposal.prospect?.familyName ||
        proposal.prospect?.primaryContactName) || "Sandman Family";
}
function getLockedPricing(proposal) {
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
    return pricing;
}
function nextBillingUnix(proposal) {
    const value = proposal.cashPrepayment?.nextBillingDate ||
        proposal.nextBillingDate;
    let millis = 0;
    if (value instanceof firestore_1.Timestamp) {
        millis = value.toMillis();
    }
    else if (value &&
        typeof value?.toMillis === "function") {
        millis = value.toMillis();
    }
    else if (value) {
        millis = new Date(value).getTime();
    }
    if (!Number.isFinite(millis) || millis <= 0) {
        throw new https_1.HttpsError("failed-precondition", "Cash prepayment is missing a valid Stripe takeover date.");
    }
    const unix = Math.floor(millis / 1000);
    if (unix <=
        Math.floor(Date.now() / 1000)) {
        throw new https_1.HttpsError("failed-precondition", "The Stripe takeover date must still be in the future.");
    }
    return unix;
}
async function recurringItems(stripe, proposalId, pricing) {
    const rawCatalogItems = Array.isArray(pricing.stripeCatalogItems)
        ? pricing.stripeCatalogItems
        : [];
    if (!rawCatalogItems.length) {
        throw new https_1.HttpsError("failed-precondition", "The locked proposal does not contain recurring Stripe catalog items.");
    }
    const items = [];
    let catalogMonthlyTotal = 0;
    for (let index = 0; index < rawCatalogItems.length; index += 1) {
        const rawItem = rawCatalogItems[index];
        if (!rawItem ||
            typeof rawItem !== "object") {
            throw new https_1.HttpsError("failed-precondition", `Stripe catalog item ${index + 1} is invalid.`);
        }
        const item = rawItem;
        const lookupKey = cleanString(item.lookupKey);
        if (![
            "sandman_academy-2026-v3_",
            "sandman_academy-2026-v4_",
        ].some((prefix) => lookupKey.startsWith(prefix))) {
            throw new https_1.HttpsError("failed-precondition", `Stripe catalog item ${index + 1} has an invalid lookup key.`);
        }
        const expectedAmount = Math.round(Number(item.amount) * 100);
        if (!Number.isSafeInteger(expectedAmount) ||
            expectedAmount < 50) {
            throw new https_1.HttpsError("failed-precondition", `Stripe catalog item ${lookupKey} has an invalid amount.`);
        }
        const rawQuantity = Number(item.quantity ?? 1);
        const quantity = Number.isInteger(rawQuantity) &&
            rawQuantity > 0
            ? rawQuantity
            : 1;
        const prices = await stripe.prices.list({
            lookup_keys: [lookupKey],
            active: true,
            limit: 10,
        });
        if (prices.data.length !== 1) {
            throw new https_1.HttpsError("failed-precondition", `Unable to resolve exactly one active Stripe Price for ${lookupKey}.`);
        }
        const price = prices.data[0];
        if (!price.active ||
            price.currency !== "usd" ||
            price.type !== "recurring" ||
            !price.recurring ||
            price.recurring.interval !== "month" ||
            price.recurring.interval_count !== 1 ||
            price.unit_amount === null ||
            price.unit_amount !== expectedAmount) {
            throw new https_1.HttpsError("failed-precondition", `Stripe Price ${lookupKey} no longer matches the locked proposal.`);
        }
        items.push({
            price: price.id,
            quantity,
        });
        catalogMonthlyTotal +=
            expectedAmount * quantity;
    }
    return {
        items,
        catalogMonthlyTotal,
    };
}
exports.createProposalAutopaySetup = (0, https_1.onCall)({
    secrets: [stripeClient_1.STRIPE_SECRET_KEY],
}, async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Management sign-in is required.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
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
    (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
    const status = cleanString(proposal.status)
        .toUpperCase();
    const followUp = cleanString(proposal.billingFollowUpStatus).toUpperCase();
    if (status !== "PAID" ||
        followUp !==
            "AUTOPAY_SETUP_REQUIRED" ||
        cleanString(proposal.paymentMethod) !== "cash_prepaid" ||
        !proposal.cashPrepayment) {
        throw new https_1.HttpsError("failed-precondition", "This proposal is not waiting for cash-prepaid Stripe autopay setup.");
    }
    if (cleanString(proposal.stripeSubscriptionId)) {
        return {
            ok: true,
            proposalId,
            status: "AUTOPAY_READY",
            alreadyComplete: true,
        };
    }
    // Validate the recurring proposal before issuing a client setup link.
    const pricing = getLockedPricing(proposal);
    nextBillingUnix(proposal);
    const stripe = (0, stripeClient_1.getStripe)();
    const pendingSessionId = cleanString(proposal.pendingAutopaySetupSessionId);
    if (pendingSessionId) {
        try {
            const existing = await stripe.checkout.sessions.retrieve(pendingSessionId);
            if (existing.status === "open" &&
                existing.url) {
                return {
                    ok: true,
                    proposalId,
                    setupSessionId: existing.id,
                    setupUrl: existing.url,
                    resumed: true,
                };
            }
            if (existing.status === "complete") {
                await handleProposalAutopaySetupCompleted(existing);
                return {
                    ok: true,
                    proposalId,
                    status: "AUTOPAY_READY",
                    reconciled: true,
                };
            }
        }
        catch (error) {
            console.warn("[createProposalAutopaySetup] Existing setup session could not be reused:", error);
        }
    }
    // Resolve catalog now so a bad or stale proposal never reaches the client.
    await recurringItems(stripe, proposalId, pricing);
    let customerId = cleanString(proposal.stripeCustomerId);
    if (!customerId) {
        const email = proposalEmail(proposal);
        const customer = await stripe.customers.create({
            name: proposalName(proposal),
            email: email && email.includes("@")
                ? email
                : undefined,
            metadata: {
                proposalId,
                source: "cash_prepaid_autopay",
            },
        }, {
            idempotencyKey: `cash-autopay-customer-${proposalId}`,
        });
        customerId =
            customer.id;
    }
    const publicBaseUrl = cleanString(process.env.SANDMAN_PUBLIC_BASE_URL) ||
        "https://www.sandmancombat.com";
    const session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        payment_method_types: [
            "card",
        ],
        client_reference_id: proposalId,
        success_url: `${publicBaseUrl}/billing/success/?autopay=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicBaseUrl}/billing/cancel/?autopay=1`,
        metadata: {
            proposalId,
            source: "cash_prepaid_autopay",
            billingFlowVersion: "cash_prepaid_setup_v1",
        },
        setup_intent_data: {
            metadata: {
                proposalId,
                source: "cash_prepaid_autopay",
                billingFlowVersion: "cash_prepaid_setup_v1",
            },
        },
        custom_text: {
            submit: {
                message: "No charge is made today. This card will be saved for future Sandman membership billing after the prepaid cash period ends.",
            },
        },
    }, {
        idempotencyKey: pendingSessionId
            ? `cash-autopay-setup-${proposalId}-retry-${pendingSessionId}`
            : `cash-autopay-setup-${proposalId}`,
    });
    if (!session.url) {
        throw new https_1.HttpsError("internal", "Stripe did not return an autopay setup URL.");
    }
    await proposalRef.set({
        stripeCustomerId: customerId,
        pendingAutopaySetupSessionId: session.id,
        autopaySetupStartedAt: firestore_1.FieldValue.serverTimestamp(),
        autopaySetupStartedBy: req.auth.uid,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        updatedBy: req.auth.uid,
    }, { merge: true });
    return {
        ok: true,
        proposalId,
        setupSessionId: session.id,
        setupUrl: session.url,
    };
});
async function handleProposalAutopaySetupCompleted(session) {
    const proposalId = cleanString(session.metadata?.proposalId);
    if (!proposalId) {
        return null;
    }
    if (cleanString(session.metadata?.source) !== "cash_prepaid_autopay") {
        return null;
    }
    if (session.mode !== "setup") {
        throw new Error(`Cash autopay session ${session.id} is not a setup session.`);
    }
    const customerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || null;
    const setupIntentId = typeof session.setup_intent === "string"
        ? session.setup_intent
        : session.setup_intent?.id || null;
    if (!customerId || !setupIntentId) {
        throw new Error(`Cash autopay session ${session.id} is missing Stripe setup details.`);
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) {
        throw new Error(`Proposal ${proposalId} was not found.`);
    }
    const proposal = proposalSnap.data() || {};
    const status = cleanString(proposal.status)
        .toUpperCase();
    const followUp = cleanString(proposal.billingFollowUpStatus).toUpperCase();
    if (status !== "PAID" ||
        ![
            "AUTOPAY_SETUP_REQUIRED",
            "AUTOPAY_READY",
        ].includes(followUp)) {
        throw new Error(`Proposal ${proposalId} is not eligible for cash-prepaid autopay completion.`);
    }
    const expectedSessionId = cleanString(proposal.pendingAutopaySetupSessionId);
    if (expectedSessionId &&
        expectedSessionId !== session.id) {
        throw new Error(`Stripe setup session ${session.id} does not match proposal ${proposalId}.`);
    }
    const stripe = (0, stripeClient_1.getStripe)();
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = typeof setupIntent.payment_method ===
        "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ||
            null;
    if (setupIntent.status !== "succeeded" ||
        !paymentMethodId) {
        throw new Error(`Proposal ${proposalId} did not return a reusable Stripe payment method.`);
    }
    const pricing = getLockedPricing(proposal);
    const firstRecurringChargeUnix = nextBillingUnix(proposal);
    const { items, catalogMonthlyTotal, } = await recurringItems(stripe, proposalId, pricing);
    const recurringAmounts = (0, lockedRecurringPricing_1.resolveLockedRecurringPricing)(pricing, catalogMonthlyTotal);
    const sponsorCoupon = await (0, proposalMonthlySponsor_1.ensureProposalMonthlySponsorCoupon)(stripe, proposalId, cleanString(pricing.catalog ||
        pricing.pricingModel), recurringAmounts);
    const savedSubscriptionId = cleanString(proposal.stripeSubscriptionId);
    const { subscription, discountId: sponsorDiscountId, } = await (0, proposalMonthlySponsor_1.recoverOrCreateProposalSubscription)(stripe, {
        proposalId,
        checkoutSessionId: session.id,
        customerId,
        firstRecurringChargeUnix,
        items: items.map((item) => ({
            price: String(item.price),
            quantity: Number(item.quantity),
        })),
        amounts: recurringAmounts,
        coupon: sponsorCoupon,
        source: "admissions_proposal",
        billingFlowVersion: "cash_prepaid_setup_v1",
    }, savedSubscriptionId || null, () => stripe.subscriptions.create({
        customer: customerId,
        items,
        ...(sponsorCoupon
            ? {
                discounts: [
                    {
                        coupon: sponsorCoupon.id,
                    },
                ],
            }
            : {}),
        expand: ["discounts"],
        collection_method: "charge_automatically",
        default_payment_method: paymentMethodId,
        billing_cycle_anchor: firstRecurringChargeUnix,
        proration_behavior: "none",
        metadata: {
            proposalId,
            checkoutSessionId: session.id,
            source: "admissions_proposal",
            billingFlowVersion: "cash_prepaid_setup_v1",
            monthlyBaseCents: String(recurringAmounts
                .monthlyBaseCents),
            monthlySponsorCents: String(recurringAmounts
                .monthlySponsorCents),
            monthlyBalanceCents: String(recurringAmounts
                .monthlyBalanceCents),
        },
    }, {
        idempotencyKey: `cash-autopay-subscription-${proposalId}-${session.id}`,
    }));
    await db.runTransaction(async (tx) => {
        const currentSnap = await tx.get(proposalRef);
        if (!currentSnap.exists) {
            throw new Error(`Proposal ${proposalId} was not found.`);
        }
        const current = currentSnap.data() || {};
        if (cleanString(current.stripeSubscriptionId) === subscription.id &&
            cleanString(current.billingFollowUpStatus).toUpperCase() ===
                "AUTOPAY_READY") {
            return;
        }
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            billingFollowUpStatus: "AUTOPAY_READY",
            stripeCustomerId: customerId,
            stripeAutopaySetupSessionId: session.id,
            stripeSetupIntentId: setupIntentId,
            stripePaymentMethodId: paymentMethodId,
            stripeSubscriptionId: subscription.id,
            stripeMonthlySponsorCouponId: sponsorCoupon?.id || null,
            stripeMonthlySponsorDiscountId: sponsorDiscountId,
            stripeLivemode: session.livemode,
            autopaySetupCompletedAt: firestore_1.FieldValue.serverTimestamp(),
            pendingAutopaySetupSessionId: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy: "stripe",
        });
        tx.create(historyRef, {
            proposalId,
            event: "AUTOPAY_SETUP_COMPLETED",
            stripeCheckoutSessionId: session.id,
            stripeSetupIntentId: setupIntentId,
            stripeSubscriptionId: subscription.id,
            createdBy: "stripe",
            createdByName: "Stripe Webhook",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return proposalId;
}
