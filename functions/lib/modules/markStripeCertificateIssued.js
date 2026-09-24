"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markStripeCertificateIssued = void 0;
exports.runMarkStripeCertificateIssued = runMarkStripeCertificateIssued;
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const recognitionService_1 = require("../services/recognitionService");
async function runMarkStripeCertificateIssued(input, dependencies = {
    loadActor: staffAuthorization_1.requireActiveStaff,
    markIssued: recognitionService_1.markStripeCertificateIssuedTransaction,
}) {
    if (!input.authUid) {
        throw new https_1.HttpsError("unauthenticated", "Coach sign-in required.");
    }
    const actor = await dependencies.loadActor(input.authUid, staffAuthorization_1.COACH_STAFF_ROLES, "Active Coach or Admin access required.");
    return dependencies.markIssued(actor, {
        athleteId: String(input.data?.athleteId ?? ""),
        expectedTier: input.data?.expectedTier,
        expectedStripe: input.data?.expectedStripe,
    });
}
exports.markStripeCertificateIssued = (0, https_1.onCall)(async (request) => {
    return runMarkStripeCertificateIssued({
        authUid: request.auth?.uid,
        data: request.data,
    });
});
