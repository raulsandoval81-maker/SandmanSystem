"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptProposalClientReview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalClientReview_1 = require("./proposalClientReview");
function normalizedName(value) {
    return value
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}
exports.acceptProposalClientReview = (0, https_1.onCall)(async (req) => {
    const proposalId = (0, proposalClientReview_1.cleanReviewString)(req.data?.proposalId);
    const token = (0, proposalClientReview_1.cleanReviewString)(req.data?.token);
    const signerName = (0, proposalClientReview_1.cleanReviewString)(req.data?.signerName);
    const signature = (0, proposalClientReview_1.cleanReviewString)(req.data?.signature);
    const signerRole = (0, proposalClientReview_1.cleanReviewString)(req.data?.signerRole);
    const consentAccepted = req.data?.consentAccepted === true;
    if (!proposalId ||
        !token ||
        !signerName ||
        !signature) {
        throw new https_1.HttpsError("invalid-argument", "Complete the signature fields before accepting the proposal.");
    }
    if (normalizedName(signerName) !==
        normalizedName(signature)) {
        throw new https_1.HttpsError("invalid-argument", "The electronic signature must match the signer name.");
    }
    if (![
        "parent_guardian",
        "adult_athlete",
    ].includes(signerRole)) {
        throw new https_1.HttpsError("invalid-argument", "Select the signer relationship.");
    }
    if (!consentAccepted) {
        throw new https_1.HttpsError("failed-precondition", "You must acknowledge the proposal terms before signing.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals")
        .doc(proposalId);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(proposalRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", "This proposal could not be found.");
        }
        const proposal = snap.data() || {};
        if (proposal.status !==
            "AWAITING_CLIENT_SIGNATURE") {
            throw new https_1.HttpsError("failed-precondition", "This proposal is no longer awaiting a signature.");
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
        if (!review.snapshot) {
            throw new https_1.HttpsError("failed-precondition", "The proposal review snapshot is missing.");
        }
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            status: "READY_FOR_CHECKOUT",
            lockedSnapshot: review.snapshot,
            clientAcceptance: {
                signerName,
                signature,
                signerRole,
                consentAccepted: true,
                snapshotVersion: review.snapshotVersion ||
                    1,
                signedSnapshot: review.snapshot,
                signedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "CLIENT_SIGNED",
            fromStatus: "AWAITING_CLIENT_SIGNATURE",
            toStatus: "READY_FOR_CHECKOUT",
            signerName,
            signerRole,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            status: "READY_FOR_CHECKOUT",
        };
    });
    return {
        ok: true,
        proposalId,
        ...result,
    };
});
