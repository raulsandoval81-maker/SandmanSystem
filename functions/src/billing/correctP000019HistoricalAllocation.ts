import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "../proposals/proposalAccess";
import { correctP000019Payments } from "./correctP000019Payments";

/**
 * Single-case corrective action; Management authentication and location-scoped.
 * No payment creation, Stripe access, or enrollment activation.
 * A second invocation is rejected by historicalPaymentCorrection.
 */
export const correctP000019HistoricalAllocation = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in to Management.");
  if (req.data?.proposalId !== "P-000019" ||
      req.data?.confirmTotalReceivedCents !== 20000 ||
      req.data?.confirmEnrollmentRemainingCents !== 1000) {
    throw new HttpsError("invalid-argument", "Explicit $200 receipt / $10 remaining confirmation is required.");
  }
  const staff = await requireProposalStaffAccess(req.auth!.uid);
  const db = getFirestore();
  const ref = db.collection("proposals").doc("P-000019");
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Proposal not found.");
    const proposal = snapshot.data() || {};
    requireProposalLocationAccess(staff, proposal.locationId);
    let correction: ReturnType<typeof correctP000019Payments>;
    try {
      correction = correctP000019Payments(proposal);
    } catch (err) {
      throw new HttpsError("failed-precondition",
        err instanceof Error ? err.message : "Historical payment evidence mismatch.");
    }
    const historyRef = ref.collection("history").doc();
    const stamp = FieldValue.serverTimestamp();
    const audit = {
      event: "HISTORICAL_PAYMENT_ALLOCATION_CORRECTED",
      proposalId: "P-000019",
      priorPaymentsBefore: correction.before,
      priorPaymentsAfter: correction.corrected,
      totalReceivedCents: correction.totalReceivedCents,
      enrollmentPaidCents: correction.enrollmentPaidCents,
      enrollmentRemainingCents: correction.enrollmentRemainingCents,
      reason: "September $100 month-to-month; October $80 membership plus $20 annual enrollment.",
      correctedBy: req.auth!.uid,
      correctedByName: staff.fullName,
      correctedAt: stamp,
    };
    tx.update(ref, {
      priorPayments: correction.corrected,
      priorPaymentsTotalCents: correction.totalReceivedCents,
      historicalPaymentCorrection: {
        historyId: historyRef.id,
        correctedBy: req.auth!.uid,
        correctedAt: stamp,
        totalReceivedCents: correction.totalReceivedCents,
      },
      updatedAt: stamp,
      updatedBy: req.auth!.uid,
    });
    tx.create(historyRef, audit);
    return {
      ok: true, proposalId: "P-000019",
      historyId: historyRef.id,
      totalReceivedCents: correction.totalReceivedCents,
      enrollmentPaidCents: correction.enrollmentPaidCents,
      enrollmentRemainingCents: correction.enrollmentRemainingCents,
    };
  });
});
