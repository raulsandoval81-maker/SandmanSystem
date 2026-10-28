import type Stripe from "stripe";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function seasonalMetadata(session: Stripe.Checkout.Session) {
  if (clean(session.metadata?.source) !== "winter_wrestling_seasonal") return null;
  const proposalId = clean(session.metadata?.proposalId);
  const installmentNumber = Number(session.metadata?.installmentNumber);
  const amountCents = Number(session.metadata?.installmentAmountCents);
  if (!proposalId || !Number.isInteger(installmentNumber) || installmentNumber < 1) {
    throw new Error("Seasonal Checkout metadata is invalid.");
  }
  return { proposalId, installmentNumber, amountCents };
}

export async function handleSeasonalProposalPaymentSucceeded(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const metadata = seasonalMetadata(session);
  if (!metadata) return null;
  if (session.payment_status !== "paid") return metadata.proposalId;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  if (!paymentIntentId) throw new Error("Seasonal payment is missing its PaymentIntent.");

  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc(metadata.proposalId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(proposalRef);
    if (!snap.exists) throw new Error(`Proposal ${metadata.proposalId} was not found.`);
    const proposal = snap.data() || {};
    const ledger = Array.isArray(proposal.seasonalPaymentLedger)
      ? proposal.seasonalPaymentLedger as Record<string, any>[]
      : [];
    const target = ledger.find((entry) => Number(entry.number) === metadata.installmentNumber);
    if (!target) throw new Error("Seasonal installment was not found in the locked ledger.");
    if (target.status === "paid") {
      if (
        clean(target.checkoutSessionId) === session.id &&
        clean(target.paymentIntentId) === paymentIntentId
      ) return;
      throw new Error("Seasonal installment is already paid by a different payment.");
    }
    if (
      clean(proposal.pendingCheckoutSessionId) !== session.id ||
      clean(target.checkoutSessionId) !== session.id ||
      Number(target.amountCents) !== metadata.amountCents
    ) {
      throw new Error("Seasonal payment does not match the pending locked installment.");
    }

    const updated = ledger.map((entry) => Number(entry.number) === metadata.installmentNumber
      ? {
          ...entry,
          status: "paid",
          paymentIntentId,
          paidAt: Timestamp.now(),
          failureReason: null,
        }
      : entry);
    const complete = updated.every((entry) => entry.status === "paid");
    const historyRef = proposalRef.collection("history").doc();
    tx.update(proposalRef, {
      status: complete ? "PAID" : "PARTIALLY_PAID",
      seasonalPaymentLedger: updated,
      pendingCheckoutSessionId: FieldValue.delete(),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      stripeLivemode: session.livemode,
      paymentStatus: complete ? "paid" : "partially_paid",
      ...(complete ? { paidAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(historyRef, {
      proposalId: metadata.proposalId,
      event: "SEASONAL_INSTALLMENT_PAID",
      installmentNumber: metadata.installmentNumber,
      amountCents: metadata.amountCents,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      toStatus: complete ? "PAID" : "PARTIALLY_PAID",
      createdBy: "stripe",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return metadata.proposalId;
}

export async function handleSeasonalProposalPaymentFailed(
  session: Stripe.Checkout.Session,
  reason: string,
): Promise<string | null> {
  const metadata = seasonalMetadata(session);
  if (!metadata) return null;
  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc(metadata.proposalId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(proposalRef);
    if (!snap.exists) throw new Error(`Proposal ${metadata.proposalId} was not found.`);
    const proposal = snap.data() || {};
    const ledger = Array.isArray(proposal.seasonalPaymentLedger)
      ? proposal.seasonalPaymentLedger as Record<string, any>[]
      : [];
    const target = ledger.find((entry) => Number(entry.number) === metadata.installmentNumber);
    if (!target || target.status === "paid") return;
    if (clean(target.checkoutSessionId) !== session.id) {
      throw new Error("Failed seasonal payment does not match the pending installment.");
    }
    const updated = ledger.map((entry) => Number(entry.number) === metadata.installmentNumber
      ? { ...entry, status: "failed", failureReason: reason }
      : entry);
    tx.update(proposalRef, {
      status: "PAYMENT_FAILED",
      seasonalPaymentLedger: updated,
      pendingCheckoutSessionId: FieldValue.delete(),
      paymentStatus: "failed",
      paymentFailureReason: reason,
      paymentFailedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(proposalRef.collection("history").doc(), {
      proposalId: metadata.proposalId,
      event: "SEASONAL_INSTALLMENT_FAILED",
      installmentNumber: metadata.installmentNumber,
      stripeCheckoutSessionId: session.id,
      reason,
      createdBy: "stripe",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return metadata.proposalId;
}
