"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRenderableCertificate = buildRenderableCertificate;
function buildRenderableCertificate(payload) {
    if (!payload?.printReady)
        return payload;
    return {
        ...payload,
        academyName: payload.academyName || "Sandman Combat",
        coach: payload.coach || "Coach Sandoval",
        certificateVersion: "v1",
        renderedAt: new Date().toISOString()
    };
}
