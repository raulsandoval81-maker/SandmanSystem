import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { requireProposalStaffAccess, requireProposalLocationAccess } from "../proposals/proposalAccess";
import { buildManualProposalAdjustment } from "./manualEdgeCaseProposalPolicy";

const clean = (x: unknown) => String(x ?? "").trim();

/**
 * A separate Management exception boundary: preview first, then commit the
 * exact server-derived ledger state in a Firestore transaction.
 * No Stripe API calls, no new receipt, no automatic signature bypass.
 */
export const manualEdgeCaseProposal = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Management sign-in is required.");
  const staff = await requireProposalStaffAccess(req.auth.uid);
  const proposalId = clean(req.data?.proposalId);
  const mode = clean(req.data?.mode);
  const entries = req.data?.entries;
  const reason = clean(req.data?.reason);
  const expectedFingerprint = clean(req.data?.expectedFingerprint);
  const actionId = clean(req.data?.actionId);
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ entries, reason })).digest("hex");
  if (!/^P-\\d{6}$/.test(proposalId) || !["preview", "commit"].includes(mode)) {
    throw new HttpsError("invalid-argument", "A valid proposal ID and preview/commit action are required.");
  }
  if (!Array.isArray(entries)) throw new HttpsError("invalid-argument", "A receipt allocation list is required.");
  if (mode === "commit" && (
    reason.length < 10 || reason.length > 500 ||
    !/^[a-f0-9]{64}$/.test(expectedFingerprint) ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(actionId)
  )) {
    throw new HttpsError("invalid-argument", "Commit requires a reason, current preview fingerprint, and unique action ID.");
  }
  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc(proposalId);
  if (mode === "preview") {
    const snap = await proposalRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Proposal not found.");
    const proposal = snap.data() || {};
    requireProposalLocationAccess(staff, proposal.locationId);
    try {
      const result = buildManualProposalAdjustment(proposal, entries);
      return {
        proposalId, mode: "preview", fingerprint: result.fingerprint,
        originalTotalCents: result.originalTotalCents,
        before: result.before, after: result.afterSummary,
        receiptChanges: result.afterPayments.map((p: any, i: number) => ({
          paymentId: p.paymentId,
          amountCents: p.amountCents,
          beforeMembershipCents: result.beforePayments[i].membershipAmountCents,
          afterMembershipCents: p.membershipAmountCents,
          beforeEnrollmentCents: result.beforePayments[i].enrollmentFeeAmountCents,
          afterEnrollmentCents: p.enrollmentFeeAmountCents,
        })),
        checkoutAuthorized: false,
      };
    } catch (error) {
      throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Invalid adjustment.");
    }
  }
  return db.runTransaction(async tx => {
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found.");
    const proposal = proposalSnap.data() || {};
    requireProposalLocationAccess(staff, proposal.locationId);
    const actionRef = proposalRef.collection("manualAdjustments").doc(actionId);
    const existingAction = await tx.get(actionRef);
    if (existingAction.exists) {
      if (existingAction.get("performedBy") !== req.auth!.uid ||
          existingAction.get("expectedFingerprint") !== expectedFingerprint ||
          existingAction.get("requestFingerprint") !== requestFingerprint) {
        throw new HttpsError("already-exists", "This action identifier was already used.");
      }
      return { ok: true, proposalId, auditId: clean(existingAction.get("auditId")), idempotent: true };
    }
    let result;
    try {
      result = buildManualProposalAdjustment(proposal, entries);
    } catch (error) {
      throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Invalid adjustment.");
    }
    if (expectedFingerprint !== result.fingerprint) {
      throw new HttpsError("aborted", "The proposal has changed. Reload and preview again; no adjustment was saved.");
    }
    const historyRef = proposalRef.collection("history").doc();
    const stamp = FieldValue.serverTimestamp();
    tx.update(proposalRef, {
      priorPayments: result.afterPayments,
      priorPaymentsTotalCents: result.originalTotalCents,
      updatedAt: stamp, updatedBy: req.auth!.uid,
    });
    tx.create(historyRef, {
      event: "MANUAL_PROPOSAL_ALLOCATION_ADJUSTED",
      proposalId, reason, originalTotalCents: result.originalTotalCents,
      before: result.before, after: result.afterSummary,
      priorPaymentsBefore: result.beforePayments,
      priorPaymentsAfter: result.afterPayments,
      createdAt: stamp, performedBy: req.auth!.uid,
      performedByName: staff.fullName || null,
      checkoutAuthorized: false, stripeChargeCreated: false,
    });
    tx.create(actionRef, {
      auditId: historyRef.id, expectedFingerprint, requestFingerprint,
      performedBy: req.auth!.uid, performedAt: stamp,
      reason, adjustmentType: "historical_receipt_allocation",
    });
    return { ok: true, proposalId, auditId: historyRef.id, idempotent: false,
      originalTotalCents: result.originalTotalCents,
      enrollmentRemainingCents: result.afterSummary.enrollmentRemainingCents,
      checkoutAuthorized: false };
  });
});
