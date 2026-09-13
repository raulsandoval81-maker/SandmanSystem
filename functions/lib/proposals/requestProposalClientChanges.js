"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestProposalClientChanges = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalClientReview_1 = require("./proposalClientReview");
exports.requestProposalClientChanges = (0, https_1.onCall)(async (req) => {
    const proposalId = (0, proposalClientReview_1.cleanReviewString)(req.data?.proposalId);
    const token = (0, proposalClientReview_1.cleanReviewString)(req.data?.token);
    const message = (0, proposalClientReview_1.cleanReviewString)(req.data?.message);
    if (!proposalId ||
        !token) {
        throw new https_1.HttpsError("invalid-argument", "A valid proposal review link is required.");
    }
    if (message.length < 3) {
        throw new https_1.HttpsError("invalid-argument", "Please tell us what you would like changed.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals")
        .doc(proposalId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(proposalRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", "This proposal could not be found.");
        }
        const proposal = snap.data() || {};
        if (proposal.status !==
            "AWAITING_CLIENT_SIGNATURE") {
            throw new https_1.HttpsError("failed-precondition", "This proposal is no longer awaiting client review.");
        }
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
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            status: "CLIENT_CHANGES_REQUESTED",
            clientChangeRequest: {
                message,
                requestedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "CLIENT_CHANGES_REQUESTED",
            fromStatus: "AWAITING_CLIENT_SIGNATURE",
            toStatus: "CLIENT_CHANGES_REQUESTED",
            message,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return {
        ok: true,
        proposalId,
        status: "CLIENT_CHANGES_REQUESTED",
    };
});
