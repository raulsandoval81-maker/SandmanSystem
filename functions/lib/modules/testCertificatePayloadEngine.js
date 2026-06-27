"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCertificatePayloadEngine = void 0;
const https_1 = require("firebase-functions/v2/https");
const athleteLoader_1 = require("../engines/athlete-engine/athleteLoader");
const certificatePayloadEngine_1 = require("../engines/certificate-engine/certificatePayloadEngine");
exports.testCertificatePayloadEngine = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const uid = String(req.query.uid || "F4_0001");
        const athlete = await (0, athleteLoader_1.loadAthlete)(uid);
        const payload = (0, certificatePayloadEngine_1.buildCertificatePayload)(athlete);
        res.status(200).json({
            success: true,
            engine: "Sandman Certificate Payload Engine",
            athlete,
            payload
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
