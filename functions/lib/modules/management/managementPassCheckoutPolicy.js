"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASS_PRICES = void 0;
exports.assertPassCheckoutRequest = assertPassCheckoutRequest;
exports.assertManagementPassMessage = assertManagementPassMessage;
exports.assertPassPrice = assertPassPrice;
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../../services/staffAuthorization");
exports.PASS_PRICES = Object.freeze({
    "combat-dropin-1day": {
        lookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
        amountCents: 2500,
    },
    "combat-dropin-2day": {
        lookupKey: "sandman_academy-2026-v3_combat_dropin_2day",
        amountCents: 4000,
    },
    "fitness-dropin": {
        lookupKey: "sandman_academy-2026-v3_fitness_dropin",
        amountCents: 1500,
    },
});
const clean = (value) => String(value ?? "").trim();
const email = (value) => clean(value).toLowerCase();
function assertPassCheckoutRequest(message, actor, confirmedPayerEmail) {
    const { locationId, passType, pass } = assertManagementPassMessage(message, actor);
    const payerEmail = email(message.email);
    if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)
        || email(confirmedPayerEmail) !== payerEmail) {
        throw new https_1.HttpsError("failed-precondition", "Confirm the payer email on this request.");
    }
    if (clean(message.passPaymentStatus).toLowerCase() === "paid") {
        throw new https_1.HttpsError("failed-precondition", "This pass has already been paid.");
    }
    if (!message.passAttendanceConfirmedAt) {
        throw new https_1.HttpsError("failed-precondition", "Confirm attendance before collecting payment.");
    }
    return { locationId, passType, pass, payerEmail };
}
function assertManagementPassMessage(message, actor) {
    if (clean(message.topic) !== "request-pass") {
        throw new https_1.HttpsError("failed-precondition", "This message is not a pass request.");
    }
    const locationId = (0, staffAuthorization_1.requireStaffLocation)(actor, message.locationId);
    const passType = clean(message.passType);
    const pass = exports.PASS_PRICES[passType];
    if (!pass)
        throw new https_1.HttpsError("failed-precondition", "Unsupported pass type.");
    if ([message.status, message.messageStatus, message.routingStage]
        .some((value) => clean(value).toUpperCase() === "CLOSED")) {
        throw new https_1.HttpsError("failed-precondition", "A closed message cannot start payment.");
    }
    if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) === "management") {
        const assigned = clean(message.assignedManagerUid) === actor.uid;
        const pending = !clean(message.assignedManagerUid)
            && clean(message.assignmentStatus) === "PENDING_MANAGEMENT";
        if (!assigned && !pending) {
            throw new https_1.HttpsError("permission-denied", "This pass request is outside your Management queue.");
        }
    }
    return { locationId, passType, pass };
}
function assertPassPrice(prices, lookupKey, amountCents) {
    if (prices.length !== 1) {
        throw new https_1.HttpsError("failed-precondition", "Exactly one active Stripe pass price is required.");
    }
    const price = prices[0];
    if (price.active !== true || price.lookup_key !== lookupKey
        || price.currency !== "usd" || price.type !== "one_time"
        || price.recurring != null || price.unit_amount !== amountCents) {
        throw new https_1.HttpsError("failed-precondition", "Stripe pass price does not match the approved catalog.");
    }
    return price;
}
