"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRenderableCertificate = buildRenderableCertificate;
function buildRenderableCertificate(payload) {
    if (!payload?.printReady)
        return payload;
    return {
        ...payload,
        academyName: payload.academyName || "Lompoc Academy of Wrestling",
        coach: payload.coach || "Coach Sandoval",
        certificateVersion: "v1",
        renderedAt: new Date().toISOString()
    };
}
