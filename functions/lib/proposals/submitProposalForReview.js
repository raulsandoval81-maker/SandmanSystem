"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitProposalForReview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
function cleanString(value) {
    return String(value ?? "").trim();
}
function nullableString(value) {
    const cleaned = cleanString(value);
    return cleaned || null;
}
function hasCoachAccess(token) {
    return (token.admin === true ||
        token.coach === true ||
        token.role === "admin" ||
        token.role === "coach");
}
exports.submitProposalForReview = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to submit a proposal.");
    }
    const token = req.auth.token;
    if (!hasCoachAccess(token)) {
        throw new https_1.HttpsError("permission-denied", "Coach or administrator access is required.");
    }
    const proposalId = cleanString(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const callerUid = req.auth.uid;
    const coachName = nullableString(req.data?.coachName ||
        token.name);
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
            const currentStatus = cleanString(proposal.status);
            if (currentStatus !== "DRAFT") {
                throw new https_1.HttpsError("failed-precondition", "Only DRAFT proposals may be submitted for review.");
            }
            const historyRef = proposalRef
                .collection("history")
                .doc();
            tx.update(proposalRef, {
                status: "REVIEW",
                updatedBy: callerUid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                submittedForReviewBy: callerUid,
                submittedForReviewAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.create(historyRef, {
                proposalId,
                event: "STATUS_CHANGED",
                fromStatus: "DRAFT",
                toStatus: "REVIEW",
                createdBy: callerUid,
                createdByName: coachName,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                proposalId,
                status: "REVIEW",
            };
        });
        return {
            ok: true,
            ...result,
        };
    }
    catch (error) {
        console.error("[submitProposalForReview] Failed:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "Unable to submit the proposal for review.");
    }
});
