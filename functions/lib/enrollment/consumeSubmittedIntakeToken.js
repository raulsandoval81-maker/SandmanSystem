"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeSubmittedIntakeToken = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
/**
 * Family clients cannot mutate bearer-token lifecycle state. Once the
 * canonical intake document is created, the server consumes the matching
 * token so the same handoff URL cannot continue to validate as unused.
 */
exports.consumeSubmittedIntakeToken = (0, firestore_2.onDocumentCreated)("intakes/{intakeId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const intake = snapshot.data() || {};
    const intakeId = clean(event.params.intakeId);
    const tokenId = clean(intake.tokenId);
    if (!intakeId || !tokenId || tokenId !== intakeId) {
        return;
    }
    const status = clean(intake.status).toLowerCase();
    if (status !== "submitted")
        return;
    const tokenRef = db.doc(`intakeTokens/${tokenId}`);
    await db.runTransaction(async (tx) => {
        const tokenSnap = await tx.get(tokenRef);
        if (!tokenSnap.exists)
            return;
        const token = tokenSnap.data() || {};
        // Do not consume an unrelated token if legacy/manual data ever reuses
        // an intake id incorrectly.
        const tokenProposalId = clean(token.proposalId);
        const intakeProposalId = clean(intake.proposalId);
        const tokenAudience = clean(token.intakeAudience).toLowerCase();
        const intakeAudience = clean(intake.intakeAudience).toLowerCase();
        if (tokenProposalId !== intakeProposalId ||
            tokenAudience !== intakeAudience) {
            return;
        }
        tx.set(tokenRef, {
            used: true,
            usedAt: firestore_1.FieldValue.serverTimestamp(),
            status: "submitted",
            intakeId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
});
