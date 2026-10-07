"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposalCheckout = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const stripeClient_1 = require("../billing/stripeClient");
const proposalAccess_1 = require("./proposalAccess");
const proposalClientReview_1 = require("./proposalClientReview");
const webhook_1 = require("../billing/webhook");
const lockedRecurringPricing_1 = require("./lockedRecurringPricing");
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
    const proposalId = cleanString(req.data?.proposalId);
    const clientToken = cleanString(req.data?.token);
    const enrollmentToken = cleanString(req.data?.enrollmentToken);
    const isClientCheckout = Boolean(enrollmentToken ||
        clientToken);
    if (!isClientCheckout &&
        !req.auth) {
        throw new https_1.HttpsError("unauthenticated", "A valid checkout link or staff sign-in is required.");
    }
    const actorUid = isClientCheckout
        ? "client"
        : req.auth.uid;
    const staffAccess = !isClientCheckout &&
        req.auth
        ? await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid)
        : null;
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
    if (staffAccess) {
        (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
    }
    else {
        if (enrollmentToken) {
            const handoff = proposal.enrollmentHandoff || {};
            const tokenMatches = (0, proposalClientReview_1.hashProposalReviewToken)(enrollmentToken) ===
                cleanString(handoff.tokenHash);
            const expiresAt = handoff.expiresAt;
            if (!tokenMatches ||
                !(expiresAt instanceof firestore_1.Timestamp) ||
                expiresAt.toMillis() <
                    Date.now()) {
                throw new https_1.HttpsError("permission-denied", "This enrollment verification link is invalid or expired.");
            }
        }
        else {
            const review = proposal.clientReview || {};
            const tokenMatches = clientToken &&
                (0, proposalClientReview_1.hashProposalReviewToken)(clientToken) ===
                    cleanString(review.tokenHash);
            if (!tokenMatches) {
                throw new https_1.HttpsError("permission-denied", "This checkout link is invalid.");
            }
            const expiresAt = review.expiresAt;
            if (!(expiresAt instanceof firestore_1.Timestamp) ||
                expiresAt.toMillis() <
                    Date.now()) {
                throw new https_1.HttpsError("failed-precondition", "This checkout link has expired.");
            }
        }
    }
    const proposalStatus = cleanString(proposal.status);
    const enrollmentConfirmation = proposal.enrollmentConfirmation &&
        typeof proposal.enrollmentConfirmation === "object"
        ? proposal.enrollmentConfirmation
        : {};
    if (enrollmentConfirmation.termsConfirmed !== true ||
        !enrollmentConfirmation.confirmedAt) {
        throw new https_1.HttpsError("failed-precondition", "Confirm the enrollment and billing details before secure checkout.");
    }
    const existingCheckoutSessionId = cleanString(proposal.pendingCheckoutSessionId);
    if (proposalStatus !==
        "READY_FOR_CHECKOUT" &&
        proposalStatus !==
            "CHECKOUT_CREATED") {
        throw new https_1.HttpsError("failed-precondition", "Only checkout-ready or active-checkout proposals may use checkout.");
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
    const lockedDueNow = toCents(pricing.dueNow);
    const enrollmentDueNow = toCents(pricing.enrollmentDueNow);
    const monthlyBalance = toCents(pricing.monthlyBalance);
    if (monthlyBalance < 50) {
        throw new https_1.HttpsError("failed-precondition", "The locked monthly balance is invalid.");
    }
    const firstRecurringChargeDate = cleanString(pricing.firstRecurringChargeDate);
    const recurringBillingDay = Number(pricing.recurringBillingDay);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstRecurringChargeDate)) {
        throw new https_1.HttpsError("failed-precondition", "The locked first recurring charge date is invalid.");
    }
    const [recurringYear, recurringMonth, recurringDay,] = firstRecurringChargeDate
        .split("-")
        .map(Number);
    const firstRecurringChargeMs = Date.UTC(recurringYear, recurringMonth - 1, recurringDay, 12, 0, 0);
    const validatedRecurringDate = new Date(firstRecurringChargeMs);
    if (validatedRecurringDate.getUTCFullYear() !==
        recurringYear ||
        validatedRecurringDate.getUTCMonth() !==
            recurringMonth - 1 ||
        validatedRecurringDate.getUTCDate() !==
            recurringDay ||
        recurringBillingDay !== 5 ||
        recurringDay !== 5) {
        throw new https_1.HttpsError("failed-precondition", "The locked recurring billing schedule is invalid.");
    }
    /*
     * Proposal pricing locks the billing day, but the proposal may sit
     * in review long enough for one or more scheduled membership charges
     * to become due. Those missed monthly charges must be collected now;
     * they are not discarded by moving the next recurring date forward.
     */
    let resolvedFirstRecurringChargeDate = firstRecurringChargeDate;
    let overdueMembershipMonths = 0;
    let cursorMs = firstRecurringChargeMs;
    const nowMs = Date.now();
    while (cursorMs <= nowMs &&
        overdueMembershipMonths < 24) {
        overdueMembershipMonths += 1;
        const cursorDate = new Date(cursorMs);
        cursorMs =
            Date.UTC(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth() + 1, 5, 12, 0, 0);
    }
    if (overdueMembershipMonths > 0) {
        const nextRecurringDate = new Date(cursorMs);
        resolvedFirstRecurringChargeDate =
            [
                nextRecurringDate.getUTCFullYear(),
                String(nextRecurringDate.getUTCMonth() + 1).padStart(2, "0"),
                "05",
            ].join("-");
    }
    const overdueMembershipDueNowCents = overdueMembershipMonths > 0
        ? monthlyBalance * overdueMembershipMonths
        : 0;
    /*
     * An unpaid proposal still owes its first month. If the proposal
     * has crossed a billing date while awaiting payment, also collect
     * each missed recurring month before starting normal billing again.
     */
    const firstMonthDueNowCents = overdueMembershipMonths > 0
        ? Math.round(Number(pricing.proratedFirstMonth || 0) * 100)
        : Math.max(0, Math.round(Number(pricing.proratedFirstMonth || 0) * 100));
    const checkoutDueNow = overdueMembershipMonths > 0
        ? enrollmentDueNow +
            firstMonthDueNowCents +
            overdueMembershipDueNowCents
        : lockedDueNow;
    if (checkoutDueNow < 50) {
        throw new https_1.HttpsError("failed-precondition", "This proposal has no payable amount due now.");
    }
    const resolvedFirstRecurringChargeMs = Date.UTC(Number(resolvedFirstRecurringChargeDate.slice(0, 4)), Number(resolvedFirstRecurringChargeDate.slice(5, 7)) - 1, Number(resolvedFirstRecurringChargeDate.slice(8, 10)), 12, 0, 0);
    const firstRecurringChargeUnix = Math.floor(resolvedFirstRecurringChargeMs / 1000);
    if (firstRecurringChargeUnix <=
        Math.floor(Date.now() / 1000)) {
        throw new https_1.HttpsError("failed-precondition", "The first recurring charge date must be in the future.");
    }
    if (checkoutDueNow < 50) {
        throw new https_1.HttpsError("failed-precondition", "This proposal has no payable amount due now. A no-charge enrollment requires a separate Management billing path.");
    }
    const athletes = Array.isArray(snapshot.athletes)
        ? snapshot.athletes
        : [];
    const athleteSummary = athletes
        .map((athlete) => {
        const name = cleanString(athlete.name ||
            athlete.athleteName);
        const program = cleanString(athlete.programName ||
            athlete.program ||
            athlete.journey ||
            athlete.track);
        return [
            name,
            program
        ]
            .filter(Boolean)
            .join(" — ");
    })
        .filter(Boolean)
        .join("; ");
    const email = cleanString(prospect.email).toLowerCase();
    const publicBaseUrl = cleanString(process.env.SANDMAN_PUBLIC_BASE_URL) || "https://www.sandmancombat.com";
    const rawCatalogItems = Array.isArray(pricing.stripeCatalogItems)
        ? pricing.stripeCatalogItems
        : [];
    if (rawCatalogItems.length === 0) {
        throw new https_1.HttpsError("failed-precondition", "The locked proposal does not contain Stripe catalog membership items. Rebuild and approve the proposal before checkout.");
    }
    const catalogItems = rawCatalogItems.map((rawItem, index) => {
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
        if (item.recurring !== true) {
            throw new https_1.HttpsError("failed-precondition", `Stripe catalog item ${lookupKey} is not marked recurring.`);
        }
        const expectedAmount = toCents(item.amount);
        if (expectedAmount < 50) {
            throw new https_1.HttpsError("failed-precondition", `Stripe catalog item ${lookupKey} has an invalid amount.`);
        }
        const rawQuantity = Number(item.quantity ?? 1);
        const quantity = Number.isInteger(rawQuantity) &&
            rawQuantity > 0
            ? rawQuantity
            : 1;
        return {
            lookupKey,
            expectedAmount,
            quantity,
        };
    });
    const lockedCatalogMonthlyTotal = catalogItems.reduce((total, item) => total +
        (item.expectedAmount *
            item.quantity), 0);
    try {
        (0, lockedRecurringPricing_1.resolveLockedRecurringPricing)(pricing, lockedCatalogMonthlyTotal);
    }
    catch (error) {
        throw new https_1.HttpsError("failed-precondition", error instanceof Error ? error.message : "Locked monthly pricing is invalid.");
    }
    try {
        const stripe = (0, stripeClient_1.getStripe)();
        const lineItems = [];
        if (checkoutDueNow > 0) {
            lineItems.push({
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: "Sandman Enrollment",
                        description: athleteSummary ||
                            `Proposal ${proposalId}`,
                    },
                    unit_amount: checkoutDueNow,
                },
                quantity: 1,
            });
        }
        for (const item of catalogItems) {
            const prices = await stripe.prices.list({
                lookup_keys: [
                    item.lookupKey,
                ],
                active: true,
                limit: 10,
            });
            if (prices.data.length !== 1) {
                throw new https_1.HttpsError("failed-precondition", `Unable to resolve exactly one active Stripe Price for ${item.lookupKey}.`);
            }
            const price = prices.data[0];
            if (!price.active ||
                price.currency !== "usd" ||
                price.type !== "recurring" ||
                !price.recurring ||
                price.recurring.interval !==
                    "month" ||
                price.recurring.interval_count !==
                    1 ||
                price.unit_amount === null) {
                throw new https_1.HttpsError("failed-precondition", `Stripe Price ${item.lookupKey} is not an active monthly USD recurring price.`);
            }
            if (price.unit_amount !==
                item.expectedAmount) {
                throw new https_1.HttpsError("failed-precondition", `Stripe Price ${item.lookupKey} does not match the locked proposal amount.`);
            }
            /*
             * Recurring membership is intentionally not
             * added to today's Checkout Session.
             *
             * The Stripe webhook creates the subscription
             * after the enrollment payment succeeds.
             */
        }
        let replacingExpiredSessionId = null;
        if (proposalStatus ===
            "CHECKOUT_CREATED" &&
            existingCheckoutSessionId) {
            const existingSession = await stripe.checkout.sessions.retrieve(existingCheckoutSessionId);
            const currentBillingFlow = cleanString(existingSession.metadata
                ?.billingFlowVersion) ===
                "payment_then_subscription_v1" &&
                existingSession.mode ===
                    "payment";
            if (existingSession.status ===
                "open" &&
                existingSession.url &&
                currentBillingFlow) {
                return {
                    ok: true,
                    proposalId,
                    status: "CHECKOUT_CREATED",
                    checkoutSessionId: existingSession.id,
                    checkoutUrl: existingSession.url,
                    resumed: true,
                };
            }
            if (existingSession.status ===
                "open" &&
                !currentBillingFlow) {
                await stripe.checkout.sessions.expire(existingSession.id);
                replacingExpiredSessionId =
                    existingSession.id;
            }
            if (existingSession.payment_status ===
                "paid") {
                await (0, webhook_1.handleProposalCheckoutCompleted)(existingSession);
                return {
                    ok: true,
                    proposalId,
                    status: "PAID",
                    checkoutSessionId: existingSession.id,
                    reconciled: true,
                };
            }
            if (existingSession.status ===
                "complete") {
                throw new https_1.HttpsError("failed-precondition", "Stripe checkout is complete but payment is not confirmed as paid.");
            }
            if (existingSession.status ===
                "expired") {
                replacingExpiredSessionId =
                    existingSession.id;
            }
            else if (!replacingExpiredSessionId) {
                throw new https_1.HttpsError("failed-precondition", `Existing Stripe checkout is ${existingSession.status || "unavailable"}.`);
            }
        }
        const checkoutIdempotencyKey = replacingExpiredSessionId
            ? `proposal-checkout-retry-${proposalId}-${replacingExpiredSessionId}`
            : `proposal-checkout-${proposalId}`;
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_creation: "always",
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
                billingFlowVersion: "payment_then_subscription_v1",
                firstRecurringChargeDate: resolvedFirstRecurringChargeDate,
                recurringBillingDay: String(recurringBillingDay),
            },
            payment_intent_data: {
                setup_future_usage: "off_session",
                metadata: {
                    proposalId,
                    source: "admissions_proposal",
                    billingFlowVersion: "payment_then_subscription_v1",
                },
            },
            custom_text: {
                submit: {
                    message: `Due today: ${(checkoutDueNow / 100).toFixed(2)}. Recurring membership: ${(monthlyBalance / 100).toFixed(2)}/month beginning ${resolvedFirstRecurringChargeDate}; billed on the 5th.`,
                },
            },
            allow_promotion_codes: false,
        }, {
            idempotencyKey: checkoutIdempotencyKey,
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
            const isReplacingExpiredCheckout = currentStatus ===
                "CHECKOUT_CREATED" &&
                Boolean(replacingExpiredSessionId) &&
                currentSessionId ===
                    replacingExpiredSessionId;
            if (currentStatus !==
                "READY_FOR_CHECKOUT" &&
                !isReplacingExpiredCheckout) {
                throw new https_1.HttpsError("failed-precondition", `Proposal ${proposalId} is no longer eligible for this checkout session.`);
            }
            const historyRef = proposalRef
                .collection("history")
                .doc();
            const lockedSnapshotForCheckout = isReplacingExpiredCheckout ||
                resolvedFirstRecurringChargeDate !==
                    firstRecurringChargeDate
                ? {
                    ...snapshot,
                    pricing: {
                        ...pricing,
                        dueNow: checkoutDueNow / 100,
                        firstRecurringChargeDate: resolvedFirstRecurringChargeDate,
                        overdueMembershipMonths,
                        overdueMembershipDueNow: overdueMembershipDueNowCents / 100,
                    },
                }
                : snapshot;
            tx.update(proposalRef, {
                status: "CHECKOUT_CREATED",
                lockedSnapshot: lockedSnapshotForCheckout,
                pendingCheckoutSessionId: session.id,
                checkoutStartedAt: firestore_1.FieldValue.serverTimestamp(),
                checkoutStartedBy: actorUid,
                checkoutStartedByType: isClientCheckout
                    ? "client"
                    : "staff",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedBy: actorUid,
            });
            tx.create(historyRef, {
                proposalId,
                event: resolvedFirstRecurringChargeDate !==
                    firstRecurringChargeDate
                    ? "RECURRING_CHARGE_DATE_ROLLED_FORWARD"
                    : isReplacingExpiredCheckout
                        ? "CHECKOUT_RESTARTED"
                        : "STATUS_CHANGED",
                fromStatus: isReplacingExpiredCheckout
                    ? "CHECKOUT_CREATED"
                    : "READY_FOR_CHECKOUT",
                toStatus: "CHECKOUT_CREATED",
                replacedCheckoutSessionId: isReplacingExpiredCheckout
                    ? replacingExpiredSessionId
                    : null,
                createdBy: actorUid,
                createdByName: cleanString(snapshot.preparedBy &&
                    typeof snapshot.preparedBy ===
                        "object"
                    ? snapshot.preparedBy.name
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
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", error instanceof Error
            ? error.message
            : "Unable to create proposal checkout.");
    }
});
