"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLockedRecurringPricing = resolveLockedRecurringPricing;
function cents(value) {
    const amount = Number(value);
    const result = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(result) || amount < 0) {
        throw new Error("Locked monthly pricing contains an invalid amount.");
    }
    return result;
}
function resolveLockedRecurringPricing(pricing, catalogMonthlyTotalCents) {
    const monthlyBaseCents = cents(pricing.monthlyBase);
    const monthlySponsorCents = cents(pricing.monthlySponsor);
    const monthlyBalanceCents = cents(pricing.monthlyBalance);
    if (monthlyBaseCents < 50 ||
        monthlySponsorCents >= monthlyBaseCents ||
        monthlyBalanceCents < 50 ||
        monthlyBaseCents - monthlySponsorCents !== monthlyBalanceCents ||
        catalogMonthlyTotalCents !== monthlyBaseCents) {
        throw new Error("Locked monthly base, sponsor, balance, and recurring catalog do not reconcile.");
    }
    return { monthlyBaseCents, monthlySponsorCents, monthlyBalanceCents };
}
