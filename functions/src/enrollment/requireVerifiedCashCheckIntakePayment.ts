import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { cashReceiptDetails } from "./combinedEnrollmentReceipt";
import { hasConflictingStripeActivity } from "../billing/prepaidReconciliationPolicy";

export async function requireVerifiedCashCheckIntakePayment(
  db: Firestore,
  transaction: Transaction,
  intake: Record<string, any>,
): Promise<boolean> {
  const proposalId = String(intake.proposalId || "").trim();
  if (!proposalId) return false;

  const snapshot = await transaction.get(db.collection("proposals").doc(proposalId));
  if (!snapshot.exists) {
    throw new HttpsError("failed-precondition", "The authoritative enrollment proposal is missing.");
  }
  const proposal = snapshot.data() || {};
  if (proposal.lockedSnapshot?.pricing?.paymentArrangement !== "prepaid_cash_check") return false;

  const payment = proposal.cashPrepayment;
  if (!intake.locationId || proposal.locationId !== intake.locationId ||
      payment?.membershipPaidInFull !== true || !payment.receivedAt || !payment.receivedBy ||
      hasConflictingStripeActivity(proposal)) {
    throw new HttpsError("failed-precondition", "Management must verify the existing Cash/Check payment before approval or minting.");
  }

  try {
    cashReceiptDetails(proposal);
  } catch {
    throw new HttpsError("failed-precondition", "Verified Cash/Check payment, allocation, and coverage are required before approval or minting.");
  }
  return true;
}
