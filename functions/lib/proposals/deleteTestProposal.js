"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTestProposal = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
}
function isAdminRole(role) {
    return (role === "admin" ||
        role === "system_admin");
}
exports.deleteTestProposal = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    if (!isAdminRole(staffAccess.role)) {
        throw new https_1.HttpsError("permission-denied", "System Admin access is required to delete a proposal.");
    }
    const proposalId = cleanString(req.data?.proposalId);
    if (!proposalId ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(proposalId)) {
        throw new https_1.HttpsError("invalid-argument", "A valid proposalId is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) {
        throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
    }
    const proposal = proposalSnap.data() || {};
    const status = cleanString(proposal.status).toUpperCase();
    if (status === "PAID") {
        throw new https_1.HttpsError("failed-precondition", "Paid proposals cannot be permanently deleted.");
    }
    const historySnap = await proposalRef
        .collection("history")
        .get();
    const batch = db.batch();
    for (const historyDoc of historySnap.docs) {
        batch.delete(historyDoc.ref);
    }
    batch.delete(proposalRef);
    await batch.commit();
    return {
        ok: true,
        proposalId,
        status,
    };
});
