import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "../proposals/proposalAccess";
import { validateHistoricalCashDisposition } from "./historicalCashDisposition";

const clean = (x: unknown) => String(x ?? "").trim();

/**
 * Management-only declaration of intent. Does not apply credits,
 * perform refunds, change dueNow, or lift the Stripe checkout gate.
 */
export const recordHistoricalCashDisposition = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in to Management.");
  const staff = await requireProposalStaffAccess(req.auth.uid);
  const proposalId = clean(req.data?.proposalId);
  const kind = clean(req.data?.kind);
  const reason = clean(req.data?.reason);
  const amountCents = req.data?.amountCents;
  const targetPeriod = clean(req.data?.targetPeriod);
  if (!proposalId || !reason || reason.length < 10 || reason.length > 500) {
    throw new HttpsError("invalid-argument", "Proposal ID and a 10–500 character reconciliation reason are required.");
  }
  const db = getFirestore();
  const ref = db.collection("proposals").doc(proposalId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Proposal not found.");
    const proposal = snap.data() || {};
    requireProposalLocationAccess(staff, proposal.locationId);
    if (clean(proposal.status).toUpperCase() !== "DRAFT") {
      throw new HttpsError("failed-precondition", "Return the proposal to Draft before recording a cash disposition.");
    }
    if (clean(proposal.clientReview?.tokenHash)) {
      throw new HttpsError("failed-precondition", "Revoke the issued client review before recording a cash disposition.");
    }
    if (proposal.historicalCashDisposition?.status === "recorded") {
      throw new HttpsError("already-exists", "An earlier disposition exists. A separate audited revision is required.");
    }
    const priorPayments = Array.isArray(proposal.priorPayments)
      ? proposal.priorPayments as Array<Record<string, unknown>>
      : [];
    const monthly = Math.round(Number(proposal.pricing?.monthlyBalance) * 100);
    const enrollment = Math.round(Number(proposal.pricing?.enrollmentBase) * 100);
    let decision;
    try {
      decision = validateHistoricalCashDisposition({
        priorPayments, monthlyMembershipCents: monthly, enrollmentFeeCents: enrollment,
        kind, amountCents, targetPeriod,
      });
    } catch (error) {
      throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Invalid disposition.");
    }
    const history = ref.collection("history").doc();
    const record = {
      status: "recorded",
      kind: decision.kind,
      amountCents: decision.amountCents,
      targetPeriod: decision.targetPeriod,
      ledgerFingerprint: decision.ledgerFingerprint,
      reason,
      recordedBy: req.auth!.uid,
      recordedByName: staff.fullName || null,
      recordedAt: FieldValue.serverTimestamp(),
      creditApplied: false,
      refundExecuted: false,
      checkoutAuthorized: false,
    };
    tx.update(ref, { historicalCashDisposition: record,
      updatedBy: req.auth!.uid, updatedAt: FieldValue.serverTimestamp() });
    tx.create(history, { event: "HISTORICAL_CASH_DISPOSITION_RECORDED",
      proposalId, ...record, createdAt: FieldValue.serverTimestamp() });
    return { ok: true, proposalId, disposition: { kind: decision.kind,
      amountCents: decision.amountCents, targetPeriod: decision.targetPeriod,
      checkoutAuthorized: false, creditApplied: false, refundExecuted: false } };
  });
});
