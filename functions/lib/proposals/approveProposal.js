"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveProposal = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
}
function nullableString(value) {
    const cleaned = cleanString(value);
    return cleaned || null;
}
exports.approveProposal = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to approve a proposal.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const proposalId = cleanString(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const callerUid = req.auth.uid;
    const coachName = nullableString(req.data?.coachName ||
        staffAccess.fullName);
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
            if (currentStatus !== "REVIEW") {
                throw new https_1.HttpsError("failed-precondition", "Only REVIEW proposals may be approved.");
            }
            const lockedSnapshot = {
                proposalId,
                prospect: proposal.prospect || {},
                coach: proposal.coach || {},
                athletes: Array.isArray(proposal.athletes)
                    ? proposal.athletes
                    : [],
                pricing: proposal.pricing || {},
                agreement: proposal.agreement || {},
                internalNotes: proposal.internalNotes || null,
            };
            const historyRef = proposalRef
                .collection("history")
                .doc();
            tx.update(proposalRef, {
                status: "READY_FOR_CHECKOUT",
                lockedSnapshot,
                updatedBy: callerUid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                approvedBy: callerUid,
                approvedAt: firestore_1.FieldValue.serverTimestamp(),
                lockedBy: callerUid,
                lockedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.create(historyRef, {
                proposalId,
                event: "STATUS_CHANGED",
                fromStatus: "REVIEW",
                toStatus: "READY_FOR_CHECKOUT",
                createdBy: callerUid,
                createdByName: coachName,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                proposalId,
                status: "READY_FOR_CHECKOUT",
            };
        });
        return {
            ok: true,
            ...result,
        };
    }
    catch (error) {
        console.error("[approveProposal] Failed:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "Unable to approve the proposal.");
    }
});
