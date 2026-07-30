"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubscriptionCheckout = createSubscriptionCheckout;
const stripeClient_1 = require("./stripeClient");
const customer_1 = require("./customer");
async function createSubscriptionCheckout(input) {
    const stripe = (0, stripeClient_1.getStripe)();
    let stripeCustomerId = input.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
        stripeCustomerId = await (0, customer_1.createStripeCustomer)({
            familyId: input.familyId,
            email: input.email,
            name: input.familyName,
        });
    }
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [
            {
                price: input.priceId,
                quantity: 1,
            },
        ],
        success_url: `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: input.cancelUrl,
        client_reference_id: input.familyId,
        metadata: {
            familyId: input.familyId,
        },
        subscription_data: {
            metadata: {
                familyId: input.familyId,
            },
        },
        allow_promotion_codes: true,
    });
    if (!session.url) {
        throw new Error("Stripe did not return a Checkout Session URL.");
    }
    return {
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        stripeCustomerId,
    };
}
