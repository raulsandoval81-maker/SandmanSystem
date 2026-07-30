"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStripeCustomer = createStripeCustomer;
const stripeClient_1 = require("./stripeClient");
async function createStripeCustomer(input) {
    const stripe = (0, stripeClient_1.getStripe)();
    const customer = await stripe.customers.create({
        email: input.email,
        name: input.name,
        metadata: {
            familyId: input.familyId,
        },
    });
    return customer.id;
}
