"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testPromotionEngine = void 0;
const https_1 = require("firebase-functions/v2/https");
const athleteLoader_1 = require("../engines/athlete-engine/athleteLoader");
const promotionEngine_1 = require("../engines/promotion-engine/promotionEngine");
exports.testPromotionEngine = (0, https_1.onRequest)(async (req, res) => {
    try {
        const uid = String(req.query.uid || "F4_0001");
        const athlete = await (0, athleteLoader_1.loadAthlete)(uid);
        const decision = (0, promotionEngine_1.evaluatePromotion)(athlete);
        res.status(200).json({
            success: true,
            engine: "Sandman Promotion Engine",
            athlete,
            decision
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
