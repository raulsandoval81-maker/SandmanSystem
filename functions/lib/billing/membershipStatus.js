"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMembershipStatus = normalizeMembershipStatus;
function normalizeMembershipStatus(stripeStatus) {
    switch (stripeStatus) {
        case "active":
        case "trialing":
            return "active";
        case "past_due":
            return "past_due";
        case "paused":
            return "paused";
        case "canceled":
            return "canceled";
        case "unpaid":
        case "incomplete_expired":
            return "unpaid";
        case "incomplete":
        default:
            return "pending";
    }
}
