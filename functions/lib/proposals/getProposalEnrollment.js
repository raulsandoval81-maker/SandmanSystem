"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProposalEnrollment = void 0;
exports.validateProposalEnrollmentToken = validateToken;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalClientReview_1 = require("./proposalClientReview");
function clean(value) {
    return String(value ?? "").trim();
}
function validateToken(proposal, enrollmentToken) {
    const handoff = proposal.enrollmentHandoff || {};
    const expiresAt = handoff.expiresAt;
    if ((0, proposalClientReview_1.hashProposalReviewToken)(enrollmentToken) !== clean(handoff.tokenHash) ||
        !(expiresAt instanceof firestore_1.Timestamp) ||
        expiresAt.toMillis() < Date.now()) {
        throw new https_1.HttpsError("permission-denied", "This Review & Confirm link is invalid or expired.");
    }
}
exports.getProposalEnrollment = (0, https_1.onCall)(async (req) => {
    const proposalId = clean(req.data?.proposalId);
    const enrollmentToken = clean(req.data?.enrollmentToken);
    if (!proposalId ||
        !enrollmentToken) {
        throw new https_1.HttpsError("invalid-argument", "A valid Review & Confirm link is required.");
    }
    const snap = await (0, firestore_1.getFirestore)()
        .collection("proposals")
        .doc(proposalId)
        .get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "This enrollment could not be found.");
    }
    const proposal = snap.data() || {};
    validateToken(proposal, enrollmentToken);
    const status = clean(proposal.status)
        .toUpperCase();
    if (![
        "READY_FOR_CHECKOUT",
        "CHECKOUT_CREATED",
        "PAID",
    ].includes(status)) {
        throw new https_1.HttpsError("failed-precondition", "This proposal is not available for Review & Confirm.");
    }
    const snapshot = proposal.lockedSnapshot &&
        typeof proposal.lockedSnapshot === "object"
        ? proposal.lockedSnapshot
        : {};
    const confirmation = proposal.enrollmentConfirmation &&
        typeof proposal.enrollmentConfirmation === "object"
        ? proposal.enrollmentConfirmation
        : {};
    const athletes = Array.isArray(snapshot.athletes)
        ? snapshot.athletes
        : [];
    const primaryAthlete = athletes[0] &&
        typeof athletes[0] === "object"
        ? athletes[0]
        : {};
    const enrollmentAudience = clean(primaryAthlete.enrollmentType).toLowerCase() === "adult"
        ? "adult_athlete"
        : "parent_guardian";
    const termsConfirmed = confirmation.termsConfirmed === true &&
        Boolean(confirmation.confirmedAt);
    const paymentStatus = status === "PAID"
        ? "PAID"
        : status === "CHECKOUT_CREATED"
            ? "PAYMENT_PENDING"
            : "NOT_STARTED";
    const enrollmentStatus = status === "PAID"
        ? "PAID"
        : !termsConfirmed
            ? "READY_FOR_ENROLLMENT"
            : status === "CHECKOUT_CREATED"
                ? "PAYMENT_PENDING"
                : "READY_FOR_PAYMENT";
    return {
        ok: true,
        enrollment: {
            proposalId,
            status: enrollmentStatus,
            paymentStatus,
            paymentRequired: true,
            prospect: snapshot.prospect || {},
            athletes,
            enrollmentAudience,
            pricing: snapshot.pricing || {},
            fundingRoute: snapshot.pricing?.fundingRoute ||
                "STANDARD",
            confirmation: {
                termsConfirmed: confirmation.termsConfirmed ===
                    true,
            },
        },
    };
});
