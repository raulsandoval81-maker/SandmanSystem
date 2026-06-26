"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testPromotionEngine = void 0;
const https_1 = require("firebase-functions/v2/https");
const sampleAthletes_1 = require("../engines/athlete-engine/sampleAthletes");
const promotionEngine_1 = require("../engines/promotion-engine/promotionEngine");
exports.testPromotionEngine = (0, https_1.onRequest)((req, res) => {
    const athlete = sampleAthletes_1.SAMPLE_ATHLETES[0];
    const decision = (0, promotionEngine_1.evaluatePromotion)(athlete);
    res.status(200).json({
        success: true,
        engine: "Sandman Promotion Engine",
        decision
    });
});
