"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnProposalToDraft = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
const stripeClient_1 = require("../billing/stripeClient");
function cleanString(value) {
    return String(value ?? "").trim();
}
exports.returnProposalToDraft = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to revise a proposal.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const proposalId = cleanString(req.data?.proposalId);
    const correctionReason = cleanString(req.data?.reason);
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
        const status = cleanString(proposal.status).toUpperCase();
        const clientRequestedChange = status === "CLIENT_CHANGES_REQUESTED";
        const managementCorrection = status === "REVIEW" ||
            status === "AWAITING_CLIENT_SIGNATURE";
        const checkoutCorrection = status === "READY_FOR_CHECKOUT" ||
            status === "CHECKOUT_CREATED";
        if (!clientRequestedChange &&
            !managementCorrection &&
            !checkoutCorrection) {
            throw new https_1.HttpsError("failed-precondition", "This proposal cannot be reopened from its current stage. Signed, checkout, payment, and enrollment stages require the appropriate downstream correction path.");
        }
        if (managementCorrection &&
            correctionReason.length < 8) {
            throw new https_1.HttpsError("invalid-argument", "A correction reason of at least 8 characters is required.");
        }
        if (checkoutCorrection &&
            proposal.pendingCheckoutSessionId) {
            try {
                const stripe = (0, stripeClient_1.getStripe)();
                const session = await stripe.checkout.sessions.retrieve(proposal.pendingCheckoutSessionId);
                if (session.status === "open") {
                    await stripe.checkout.sessions.expire(proposal.pendingCheckoutSessionId);
                }
            }
            catch (error) {
                console.warn("[returnProposalToDraft] unable to expire old checkout session", error);
            }
        }
        const historyRef = proposalRef.collection("history").doc();
        tx.update(proposalRef, {
            status: "DRAFT",
            clientReview: firestore_1.FieldValue.delete(),
            clientAcceptance: firestore_1.FieldValue.delete(),
            lockedSnapshot: firestore_1.FieldValue.delete(),
            approvedAt: firestore_1.FieldValue.delete(),
            approvedBy: firestore_1.FieldValue.delete(),
            lockedAt: firestore_1.FieldValue.delete(),
            lockedBy: firestore_1.FieldValue.delete(),
            pendingCheckoutSessionId: firestore_1.FieldValue.delete(),
            checkoutSessionCreatedAt: firestore_1.FieldValue.delete(),
            updatedBy: req.auth.uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "STATUS_CHANGED",
            fromStatus: status,
            toStatus: "DRAFT",
            reason: clientRequestedChange
                ? "CLIENT_REVISION_REQUESTED"
                : "MANAGEMENT_CORRECTION",
            correctionReason: managementCorrection || checkoutCorrection
                ? correctionReason
                : "",
            createdBy: req.auth.uid,
            createdByName: staffAccess.fullName,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            ok: true,
            proposalId,
            status: "DRAFT",
            correction: managementCorrection || checkoutCorrection,
        };
    });
});
