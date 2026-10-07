"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordProposalPrepaidCash = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("../proposals/proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
}
function toPositiveInteger(value, fieldName) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) ||
        parsed <= 0) {
        throw new https_1.HttpsError("invalid-argument", `${fieldName} must be a positive whole number.`);
    }
    return parsed;
}
function parseLocalDate(value) {
    const raw = cleanString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new https_1.HttpsError("invalid-argument", "nextBillingDate must use YYYY-MM-DD.");
    }
    const parsed = new Date(`${raw}T12:00:00-07:00`);
    if (Number.isNaN(parsed.getTime())) {
        throw new https_1.HttpsError("invalid-argument", "nextBillingDate is invalid.");
    }
    return firestore_1.Timestamp.fromDate(parsed);
}
exports.recordProposalPrepaidCash = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to record a cash payment.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const proposalId = cleanString(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const amountCents = toPositiveInteger(req.data?.amountCents, "amountCents");
    const monthsCovered = toPositiveInteger(req.data?.monthsCovered, "monthsCovered");
    const enrollmentFeePaid = req.data?.enrollmentFeePaid === true;
    const nextBillingDate = parseLocalDate(req.data?.nextBillingDate);
    const note = cleanString(req.data?.note) ||
        null;
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    try {
        const result = await db.runTransaction(async (tx) => {
            const proposalSnap = await tx.get(proposalRef);
            if (!proposalSnap.exists) {
                throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
            }
            const proposal = proposalSnap.data() || {};
            (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
            const currentStatus = cleanString(proposal.status).toUpperCase();
            const hasStripePayment = [
                proposal.stripePaymentIntentId,
                proposal.stripeCheckoutSessionId,
                proposal.pendingCheckoutSessionId,
                proposal.stripeSubscriptionId,
            ].some((value) => Boolean(cleanString(value)));
            const isCheckoutReady = currentStatus ===
                "READY_FOR_CHECKOUT";
            const isLegacyPaidWithoutStripe = currentStatus === "PAID" &&
                !hasStripePayment;
            if (!isCheckoutReady &&
                !isLegacyPaidWithoutStripe) {
                throw new https_1.HttpsError("failed-precondition", currentStatus === "PAID"
                    ? "This proposal already has Stripe payment activity and cannot be changed to prepaid cash."
                    : "Prepaid cash may only be recorded before Stripe checkout begins or on a paid proposal with no Stripe payment attached.");
            }
            if (proposal.cashPrepayment) {
                throw new https_1.HttpsError("already-exists", "Prepaid cash has already been recorded for this proposal.");
            }
            const nextStatus = "PAID";
            const historyRef = proposalRef
                .collection("history")
                .doc();
            tx.update(proposalRef, {
                status: nextStatus,
                billingFollowUpStatus: "AUTOPAY_SETUP_REQUIRED",
                paymentMethod: "cash_prepaid",
                paymentStatus: "paid",
                paidAt: proposal.paidAt ||
                    firestore_1.FieldValue.serverTimestamp(),
                cashPrepayment: {
                    amountCents,
                    monthsCovered,
                    enrollmentFeePaid,
                    nextBillingDate,
                    note,
                    receivedBy: req.auth.uid,
                    receivedByName: staffAccess.fullName,
                    receivedAt: firestore_1.FieldValue.serverTimestamp(),
                },
                nextBillingDate,
                updatedBy: req.auth.uid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.create(historyRef, {
                proposalId,
                event: "CASH_PREPAYMENT_RECORDED",
                fromStatus: currentStatus,
                toStatus: nextStatus,
                amountCents,
                monthsCovered,
                enrollmentFeePaid,
                nextBillingDate,
                note,
                createdBy: req.auth.uid,
                createdByName: staffAccess.fullName,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                proposalId,
                status: nextStatus,
                amountCents,
                monthsCovered,
                enrollmentFeePaid,
            };
        });
        return {
            ok: true,
            ...result,
        };
    }
    catch (error) {
        console.error("[recordProposalPrepaidCash] Failed:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "Unable to record prepaid cash.");
    }
});
