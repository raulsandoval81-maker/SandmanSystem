"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueProposalClientReview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
const proposalClientReview_1 = require("./proposalClientReview");
exports.issueProposalClientReview = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to issue a client proposal review.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const proposalId = (0, proposalClientReview_1.cleanReviewString)(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals")
        .doc(proposalId);
    const rawToken = (0, proposalClientReview_1.createProposalReviewToken)();
    const tokenHash = (0, proposalClientReview_1.hashProposalReviewToken)(rawToken);
    const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() +
        7 * 24 * 60 * 60 * 1000);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(proposalRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
        }
        const proposal = snap.data() || {};
        (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
        const status = (0, proposalClientReview_1.cleanReviewString)(proposal.status);
        if (status !== "REVIEW" &&
            status !==
                "AWAITING_CLIENT_SIGNATURE") {
            throw new https_1.HttpsError("failed-precondition", "Only REVIEW proposals may be sent to the client.");
        }
        const existingSnapshot = proposal.clientReview?.snapshot;
        const clientSnapshot = existingSnapshot ||
            (0, proposalClientReview_1.buildClientProposalSnapshot)(proposalId, proposal);
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            status: "AWAITING_CLIENT_SIGNATURE",
            clientReview: {
                tokenHash,
                expiresAt,
                snapshotVersion: 1,
                snapshot: clientSnapshot,
                issuedBy: req.auth.uid,
                issuedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            updatedBy: req.auth.uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "CLIENT_REVIEW_ISSUED",
            fromStatus: status,
            toStatus: "AWAITING_CLIENT_SIGNATURE",
            createdBy: req.auth.uid,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            status: "AWAITING_CLIENT_SIGNATURE",
        };
    });
    return {
        ok: true,
        proposalId,
        ...result,
        reviewPath: "/connect/proposals/review/" +
            `?proposalId=${encodeURIComponent(proposalId)}` +
            `&token=${encodeURIComponent(rawToken)}`,
        expiresAt: expiresAt
            .toDate()
            .toISOString(),
    };
});
