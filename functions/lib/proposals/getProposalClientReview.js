"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProposalClientReview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalClientReview_1 = require("./proposalClientReview");
exports.getProposalClientReview = (0, https_1.onCall)(async (req) => {
    const proposalId = (0, proposalClientReview_1.cleanReviewString)(req.data?.proposalId);
    const token = (0, proposalClientReview_1.cleanReviewString)(req.data?.token);
    if (!proposalId || !token) {
        throw new https_1.HttpsError("invalid-argument", "A valid proposal review link is required.");
    }
    const snap = await (0, firestore_1.getFirestore)()
        .collection("proposals")
        .doc(proposalId)
        .get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "This proposal could not be found.");
    }
    const proposal = snap.data() || {};
    const review = proposal.clientReview || {};
    if ((0, proposalClientReview_1.hashProposalReviewToken)(token) !==
        (0, proposalClientReview_1.cleanReviewString)(review.tokenHash)) {
        throw new https_1.HttpsError("permission-denied", "This proposal review link is invalid.");
    }
    const expiresAt = review.expiresAt;
    if (!(expiresAt instanceof firestore_1.Timestamp) ||
        expiresAt.toMillis() <
            Date.now()) {
        throw new https_1.HttpsError("failed-precondition", "This proposal review link has expired.");
    }
    const allowedStatuses = new Set([
        "AWAITING_CLIENT_SIGNATURE",
        "CLIENT_SIGNED",
        "CLIENT_CHANGES_REQUESTED",
        "READY_FOR_CHECKOUT",
        "CHECKOUT_CREATED",
    ]);
    if (!allowedStatuses.has((0, proposalClientReview_1.cleanReviewString)(proposal.status))) {
        throw new https_1.HttpsError("failed-precondition", "This proposal is no longer available for client review.");
    }
    return {
        ok: true,
        proposalId,
        status: proposal.status,
        proposal: review.snapshot || null,
        signed: proposal.status ===
            "CLIENT_SIGNED" ||
            proposal.status ===
                "READY_FOR_CHECKOUT" ||
            proposal.status ===
                "CHECKOUT_CREATED",
        changesRequested: proposal.status ===
            "CLIENT_CHANGES_REQUESTED",
    };
});
