"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnProposalToDraft = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
}
exports.returnProposalToDraft = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to revise a proposal.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const proposalId = cleanString(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals").doc(proposalId);
    return db.runTransaction(async (tx) => {
        const proposalSnap = await tx.get(proposalRef);
        if (!proposalSnap.exists) {
            throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
        }
        const proposal = proposalSnap.data() || {};
        (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
        if (cleanString(proposal.status) !== "CLIENT_CHANGES_REQUESTED") {
            throw new https_1.HttpsError("failed-precondition", "Only a proposal with client-requested changes may return to draft.");
        }
        const historyRef = proposalRef.collection("history").doc();
        tx.update(proposalRef, {
            status: "DRAFT",
            clientReview: firestore_1.FieldValue.delete(),
            updatedBy: req.auth.uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "STATUS_CHANGED",
            fromStatus: "CLIENT_CHANGES_REQUESTED",
            toStatus: "DRAFT",
            reason: "CLIENT_REVISION_REQUESTED",
            createdBy: req.auth.uid,
            createdByName: staffAccess.fullName,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            ok: true,
            proposalId,
            status: "DRAFT",
        };
    });
});
