import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  requireProposalLocationAccess,
  requireProposalStaffAccess,
} from "../proposals/proposalAccess";

const clean = (value: unknown) => String(value ?? "").trim();

export const approveProposalRenewalAutopay = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Management sign-in is required.");
  }
  if (req.data?.approved !== true) {
    throw new HttpsError(
      "invalid-argument",
      "Management must explicitly approve the renewal autopay arrangement."
    );
  }

  const proposalId = clean(req.data?.proposalId);
  if (!proposalId) throw new HttpsError("invalid-argument", "proposalId is required.");
  const actor = await requireProposalStaffAccess(req.auth.uid);
  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc(proposalId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(proposalRef);
    if (!snap.exists) throw new HttpsError("not-found", "Proposal was not found.");
    const proposal = snap.data() || {};
    requireProposalLocationAccess(actor, proposal.locationId);

    if (
      clean(proposal.status).toUpperCase() !== "PAID" ||
      clean(proposal.billingFollowUpStatus).toUpperCase() !==
        "RENEWAL_AUTOPAY_APPROVAL_REQUIRED" ||
      proposal.cashPrepayment?.membershipPaidInFull !== true
    ) {
      throw new HttpsError(
        "failed-precondition",
        "A complete twelve-month prepaid membership is required before renewal autopay approval."
      );
    }
    if (clean(proposal.stripeSubscriptionId)) {
      throw new HttpsError("already-exists", "A Stripe subscription already exists.");
    }

    const historyRef = proposalRef.collection("history").doc();
    tx.update(proposalRef, {
      billingFollowUpStatus: "AUTOPAY_SETUP_REQUIRED",
      renewalArrangement: {
        type: "autopay",
        approved: true,
        approvedBy: req.auth!.uid,
        approvedByName: actor.fullName,
        approvedAt: FieldValue.serverTimestamp(),
        startsAfter: proposal.cashPrepayment.membershipPaidThroughDate,
      },
      updatedBy: req.auth!.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(historyRef, {
      proposalId,
      event: "RENEWAL_AUTOPAY_APPROVED",
      membershipPaidThroughDate: proposal.cashPrepayment.membershipPaidThroughDate,
      nextBillingDate: proposal.cashPrepayment.nextBillingDate,
      createdBy: req.auth!.uid,
      createdByName: actor.fullName,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, proposalId, billingFollowUpStatus: "AUTOPAY_SETUP_REQUIRED" };
});
