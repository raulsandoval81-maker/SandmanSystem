"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordManualProposalSignature = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
}
exports.recordManualProposalSignature = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to record a manual signature.");
    }
    const callerUid = req.auth.uid;
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(callerUid);
    const proposalId = cleanString(req.data?.proposalId);
    const signerName = cleanString(req.data?.signerName);
    const signerRole = cleanString(req.data?.signerRole);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    if (!signerName) {
        throw new https_1.HttpsError("invalid-argument", "signerName is required.");
    }
    if (![
        "parent_guardian",
        "adult_athlete",
    ].includes(signerRole)) {
        throw new https_1.HttpsError("invalid-argument", "Select the signer relationship.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(proposalRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
        }
        const proposal = snap.data() || {};
        (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
        const currentStatus = cleanString(proposal.status).toUpperCase();
        if (currentStatus !==
            "AWAITING_CLIENT_SIGNATURE") {
            throw new https_1.HttpsError("failed-precondition", "Only proposals awaiting client signature may be recorded as manually signed.");
        }
        const review = proposal.clientReview || {};
        if (!review.snapshot) {
            throw new https_1.HttpsError("failed-precondition", "The proposal review snapshot is missing.");
        }
        const approvedBy = cleanString(review.issuedBy) ||
            callerUid;
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            status: "READY_FOR_CHECKOUT",
            lockedSnapshot: review.snapshot,
            clientAcceptance: {
                signerName,
                signerRole,
                consentAccepted: true,
                signatureMethod: "manual_form",
                acceptanceScope: "proposal_acceptance_only",
                recordedBy: callerUid,
                recordedByName: staffAccess.fullName,
                snapshotVersion: review.snapshotVersion ||
                    1,
                signedSnapshot: review.snapshot,
                signedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            approvedBy,
            approvedAt: review.issuedAt ||
                firestore_1.FieldValue.serverTimestamp(),
            lockedBy: approvedBy,
            lockedAt: review.issuedAt ||
                firestore_1.FieldValue.serverTimestamp(),
            updatedBy: callerUid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "CLIENT_SIGNED",
            fromStatus: "AWAITING_CLIENT_SIGNATURE",
            toStatus: "READY_FOR_CHECKOUT",
            signerName,
            signerRole,
            signatureMethod: "manual_form",
            acceptanceScope: "proposal_acceptance_only",
            recordedBy: callerUid,
            recordedByName: staffAccess.fullName,
            approvedBy,
            approvalSource: "manual_form",
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
});
