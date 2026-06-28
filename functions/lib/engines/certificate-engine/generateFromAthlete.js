"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCertificateFromAthlete = generateCertificateFromAthlete;
const certificatePayloadEngine_1 = require("./certificatePayloadEngine");
const certificateRenderer_1 = require("./certificateRenderer");
function generateCertificateFromAthlete(athlete) {
    const payload = (0, certificatePayloadEngine_1.buildCertificatePayload)(athlete);
    if (!payload.printReady) {
        return payload;
    }
    return (0, certificateRenderer_1.buildRenderableCertificate)(payload);
}
