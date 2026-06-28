"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateStripe = evaluateStripe;
const stripeStatus_1 = require("./stripeStatus");
function evaluateStripe(athlete) {
    const status = (0, stripeStatus_1.getStripeStatus)(athlete);
    let action = "NO_ACTION";
    if (status.status === "STRIPE_CERTIFICATE_READY") {
        action = "GENERATE_STRIPE_CERTIFICATE";
    }
    if (status.status === "TESTING_ELIGIBLE_STRIPE_READY") {
        action = "GENERATE_TESTING_ELIGIBLE_STRIPE_CERTIFICATE";
    }
    if (status.status === "FULLY_STRIPED") {
        action = "READY_FOR_TESTING";
    }
    return {
        engine: "Sandman Stripe Engine",
        action,
        ...status
    };
}
