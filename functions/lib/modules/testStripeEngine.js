"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testStripeEngine = void 0;
const https_1 = require("firebase-functions/v2/https");
const sampleAthletes_1 = require("../engines/athlete-engine/sampleAthletes");
const stripeEngine_1 = require("../engines/stripe-engine/stripeEngine");
exports.testStripeEngine = (0, https_1.onRequest)((req, res) => {
    const athlete = sampleAthletes_1.SAMPLE_ATHLETES[0];
    const decision = (0, stripeEngine_1.evaluateStripe)(athlete);
    res.status(200).json({
        success: true,
        engine: "Sandman Stripe Engine",
        decision
    });
});
