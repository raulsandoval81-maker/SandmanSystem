"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureProposalMonthlySponsorCoupon = ensureProposalMonthlySponsorCoupon;
exports.verifyProposalSubscriptionDiscount = verifyProposalSubscriptionDiscount;
exports.verifyProposalSubscription = verifyProposalSubscription;
exports.recoverOrCreateProposalSubscription = recoverOrCreateProposalSubscription;
async function ensureProposalMonthlySponsorCoupon(stripe, proposalId, pricingVersion, amounts) {
    if (amounts.monthlySponsorCents === 0)
        return null;
    if (amounts.monthlySponsorCents < 0 || amounts.monthlySponsorCents >= amounts.monthlyBaseCents) {
        throw new Error(`Proposal ${proposalId} has an invalid monthly sponsor amount.`);
    }
    const id = `sandman_proposal_monthly_sponsor_${proposalId}`;
    let coupon;
    try {
        coupon = await stripe.coupons.retrieve(id);
    }
    catch (error) {
        if (error.code !== "resource_missing")
            throw error;
        try {
            coupon = await stripe.coupons.create({
                id,
                amount_off: amounts.monthlySponsorCents,
                currency: "usd",
                duration: "forever",
                name: `Approved monthly sponsor — ${proposalId}`,
                metadata: {
                    proposalId,
                    sponsorAmount: String(amounts.monthlySponsorCents),
                    pricingVersion,
                    source: "proposal_monthly_sponsor",
                },
            }, { idempotencyKey: `proposal-monthly-sponsor-${proposalId}` });
        }
        catch (createError) {
            // A concurrent webhook may have created the same deterministic coupon.
            if (createError.code !== "resource_already_exists")
                throw createError;
            coupon = await stripe.coupons.retrieve(id);
        }
    }
    if (coupon.id !== id || coupon.valid !== true ||
        coupon.amount_off !== amounts.monthlySponsorCents ||
        coupon.currency !== "usd" || coupon.duration !== "forever" ||
        coupon.metadata?.proposalId !== proposalId ||
        coupon.metadata?.sponsorAmount !== String(amounts.monthlySponsorCents) ||
        coupon.metadata?.pricingVersion !== pricingVersion ||
        coupon.metadata?.source !== "proposal_monthly_sponsor") {
        throw new Error(`Proposal ${proposalId} sponsor coupon does not match its locked pricing.`);
    }
    return coupon;
}
function verifyProposalSubscriptionDiscount(subscription, coupon, amounts) {
    const actualBaseCents = subscription.items.data.reduce((total, item) => {
        const price = item.price;
        const quantity = item.quantity;
        if (price.currency !== "usd" || price.unit_amount === null ||
            price.recurring?.interval !== "month" ||
            price.recurring?.interval_count !== 1 ||
            typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) {
            throw new Error("Subscription has an invalid recurring item.");
        }
        return total + price.unit_amount * quantity;
    }, 0);
    if (actualBaseCents !== amounts.monthlyBaseCents) {
        throw new Error("Subscription recurring base differs from the locked monthly base.");
    }
    const discounts = subscription.discounts || [];
    if (!coupon) {
        if (discounts.length !== 0 || amounts.monthlyBaseCents !== amounts.monthlyBalanceCents) {
            throw new Error("Subscription has an unapproved discount.");
        }
        return null;
    }
    if (discounts.length !== 1 || typeof discounts[0] === "string") {
        throw new Error("Subscription sponsor discount could not be verified.");
    }
    const discount = discounts[0];
    const appliedCoupon = discount.source?.coupon;
    const appliedCouponId = typeof appliedCoupon === "string" ? appliedCoupon : appliedCoupon?.id;
    if (discount.subscription !== subscription.id ||
        discount.source?.type !== "coupon" ||
        appliedCouponId !== coupon.id ||
        amounts.monthlyBaseCents - coupon.amount_off !== amounts.monthlyBalanceCents) {
        throw new Error("Subscription recurring amount differs from the locked monthly balance.");
    }
    return discount.id;
}
function verifyProposalSubscription(subscription, identity) {
    const customerId = typeof subscription.customer === "string"
        ? subscription.customer : subscription.customer.id;
    const metadata = subscription.metadata || {};
    if (customerId !== identity.customerId ||
        metadata.proposalId !== identity.proposalId ||
        metadata.source !== "admissions_proposal" ||
        metadata.billingFlowVersion !== "payment_then_subscription_v1" ||
        (metadata.checkoutSessionId && metadata.checkoutSessionId !== identity.checkoutSessionId) ||
        metadata.monthlyBaseCents !== String(identity.amounts.monthlyBaseCents) ||
        metadata.monthlySponsorCents !== String(identity.amounts.monthlySponsorCents) ||
        metadata.monthlyBalanceCents !== String(identity.amounts.monthlyBalanceCents) ||
        subscription.billing_cycle_anchor !== identity.firstRecurringChargeUnix ||
        !["active", "trialing"].includes(subscription.status) ||
        subscription.cancel_at_period_end === true ||
        subscription.cancel_at != null) {
        throw new Error(`Proposal ${identity.proposalId} subscription identity or schedule mismatch.`);
    }
    const actualItems = subscription.items.data.map((item) => ({
        price: item.price.id,
        quantity: item.quantity,
    }));
    const byPrice = (a) => a.price;
    actualItems.sort((a, b) => byPrice(a).localeCompare(byPrice(b)));
    const expectedItems = [...identity.items].sort((a, b) => byPrice(a).localeCompare(byPrice(b)));
    if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems)) {
        throw new Error(`Proposal ${identity.proposalId} subscription Price items mismatch.`);
    }
    return verifyProposalSubscriptionDiscount(subscription, identity.coupon, identity.amounts);
}
async function recoverOrCreateProposalSubscription(stripe, identity, savedSubscriptionId, create) {
    let subscription = null;
    if (savedSubscriptionId) {
        subscription = await stripe.subscriptions.retrieve(savedSubscriptionId, { expand: ["discounts"] });
        if (!subscription) {
            throw new Error(`Proposal ${identity.proposalId} saved Stripe subscription was not found.`);
        }
    }
    else {
        let startingAfter;
        const matches = [];
        do {
            const page = await stripe.subscriptions.list({
                customer: identity.customerId,
                status: "all",
                limit: 100,
                ...(startingAfter ? { starting_after: startingAfter } : {}),
                expand: ["data.discounts"],
            });
            matches.push(...page.data.filter((candidate) => candidate.metadata?.proposalId === identity.proposalId));
            if (!page.has_more)
                break;
            if (!page.data.length)
                throw new Error("Stripe subscription pagination failed.");
            startingAfter = page.data[page.data.length - 1].id;
        } while (true);
        if (matches.length > 1) {
            throw new Error(`Proposal ${identity.proposalId} has multiple Stripe subscriptions; manual review required.`);
        }
        subscription = matches[0] || null;
    }
    const recovered = Boolean(subscription);
    if (!subscription)
        subscription = await create();
    const discountId = verifyProposalSubscription(subscription, identity);
    return { subscription, discountId, recovered };
}
