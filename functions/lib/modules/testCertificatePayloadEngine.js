"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCertificatePayloadEngine = void 0;
const https_1 = require("firebase-functions/v2/https");
const sampleAthletes_1 = require("../engines/athlete-engine/sampleAthletes");
const certificatePayloadEngine_1 = require("../engines/certificate-engine/certificatePayloadEngine");
exports.testCertificatePayloadEngine = (0, https_1.onRequest)((req, res) => {
    const athlete = sampleAthletes_1.SAMPLE_ATHLETES[0];
    const payload = (0, certificatePayloadEngine_1.buildCertificatePayload)(athlete);
    res.status(200).json({
        success: true,
        engine: "Sandman Certificate Payload Engine",
        payload
    });
});
