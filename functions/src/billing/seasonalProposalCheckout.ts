import type Stripe from "stripe";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { isSeasonalProposalPricing } from "../proposals/seasonalProposal";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export type SeasonalLedgerEntry = {
  number: number;
  amountCents: number;
  dueDate: string;
  status: "scheduled" | "pending" | "paid" | "failed";
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  failureReason?: string | null;
};

function lockedSeasonalPricing(proposal: Record<string, any>): Record<string, any> {
  const snapshot = proposal.lockedSnapshot;
  const pricing = snapshot?.pricing;
  if (!isSeasonalProposalPricing(pricing)) {
    throw new HttpsError("failed-precondition", "The locked seasonal pricing is missing.");
  }
  if (pricing.campaignId !== "winter-wrestling-2026-27") {
    throw new HttpsError("failed-precondition", "The locked seasonal campaign is invalid.");
  }
  if (pricing.automaticFuturePayments !== false) {
    throw new HttpsError("failed-precondition", "Seasonal proposals cannot authorize future automatic payments.");
  }
  return pricing;
}

function initialLedger(pricing: Record<string, any>): SeasonalLedgerEntry[] {
  if (!Array.isArray(pricing.installments) || pricing.installments.length < 1) {
    throw new HttpsError("failed-precondition", "The locked seasonal installment schedule is missing.");
  }
  const ledger = pricing.installments.map((entry: Record<string, unknown>, index: number) => ({
    number: Number(entry.number),
    amountCents: Number(entry.amountCents),
    dueDate: clean(entry.dueDate),
    status: "scheduled" as const,
  }));
  if (ledger.some((entry, index) =>
    entry.number !== index + 1 ||
    !Number.isSafeInteger(entry.amountCents) ||
    entry.amountCents < 50 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate)
  )) {
    throw new HttpsError("failed-precondition", "The locked seasonal installment schedule is invalid.");
  }
  if (ledger.reduce((sum, entry) => sum + entry.amountCents, 0) !== Number(pricing.totalCents)) {
    throw new HttpsError("failed-precondition", "The locked seasonal installments do not reconcile.");
  }
  return ledger;
}

export async function createSeasonalProposalCheckout(input: {
  stripe: Stripe;
  db: Firestore;
  proposalId: string;
  proposal: Record<string, any>;
  actorUid: string;
  publicBaseUrl: string;
}): Promise<Record<string, unknown>> {
  const { stripe, db, proposalId, proposal, actorUid, publicBaseUrl } = input;
  const pricing = lockedSeasonalPricing(proposal);
  const proposalRef = db.collection("proposals").doc(proposalId);
  const ledger: SeasonalLedgerEntry[] = Array.isArray(proposal.seasonalPaymentLedger)
    ? proposal.seasonalPaymentLedger
    : initialLedger(pricing);
  const next = ledger.find((entry) => entry.status !== "paid");
  if (!next) {
    return { ok: true, proposalId, status: "PAID", alreadyPaid: true };
  }

  const pendingSessionId = clean(proposal.pendingCheckoutSessionId);
  let replacingSessionId: string | null =
    next.status === "failed" ? clean(next.checkoutSessionId) || null : null;
  if (pendingSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(pendingSessionId);
    const sameInstallment =
      clean(existing.metadata?.source) === "winter_wrestling_seasonal" &&
      Number(existing.metadata?.installmentNumber) === next.number;
    if (existing.status === "open" && existing.url && sameInstallment) {
      return {
        ok: true,
        proposalId,
        status: "CHECKOUT_CREATED",
        checkoutSessionId: existing.id,
        checkoutUrl: existing.url,
        installmentNumber: next.number,
        resumed: true,
      };
    }
    if (existing.payment_status === "paid") {
      throw new HttpsError(
        "failed-precondition",
        "Payment is confirmed by Stripe and is awaiting webhook reconciliation.",
      );
    }
    if (existing.status === "open") {
      await stripe.checkout.sessions.expire(existing.id);
    }
    replacingSessionId = existing.id;
  }

  const snapshot = proposal.lockedSnapshot || {};
  const prospect = snapshot.prospect || {};
  const athleteCount = Number(pricing.athleteCount);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `Winter Wrestling 2026–27 — installment ${next.number}`,
          description: `${athleteCount} athlete${athleteCount === 1 ? "" : "s"} · ${pricing.trainingSchedule}`,
        },
        unit_amount: next.amountCents,
      },
      quantity: 1,
    }],
    customer_email: clean(prospect.email).includes("@")
      ? clean(prospect.email).toLowerCase()
      : undefined,
    success_url: `${publicBaseUrl}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicBaseUrl}/billing/cancel/`,
    client_reference_id: proposalId,
    metadata: {
      proposalId,
      source: "winter_wrestling_seasonal",
      paymentFlow: "seasonal_one_time",
      campaignId: "winter-wrestling-2026-27",
      installmentNumber: String(next.number),
      installmentAmountCents: String(next.amountCents),
    },
    payment_intent_data: {
      metadata: {
        proposalId,
        source: "winter_wrestling_seasonal",
        installmentNumber: String(next.number),
      },
    },
    custom_text: {
      submit: {
        message: "One-time seasonal payment only. This does not authorize automatic future charges.",
      },
    },
  }, {
    idempotencyKey: replacingSessionId
      ? `seasonal-checkout-${proposalId}-${next.number}-${replacingSessionId}`
      : `seasonal-checkout-${proposalId}-${next.number}`,
  });

  const updatedLedger = ledger.map((entry) => entry.number === next.number
    ? {
        ...entry,
        status: "pending" as const,
        checkoutSessionId: session.id,
        paymentIntentId: null,
        failureReason: null,
      }
    : entry);

  await db.runTransaction(async (tx) => {
    const current = await tx.get(proposalRef);
    if (!current.exists) throw new HttpsError("not-found", `Proposal ${proposalId} was not found.`);
    const data = current.data() || {};
    if (!["READY_FOR_CHECKOUT", "CHECKOUT_CREATED", "PARTIALLY_PAID", "PAYMENT_FAILED"].includes(clean(data.status))) {
      throw new HttpsError("failed-precondition", "This seasonal proposal is not eligible for checkout.");
    }
    const currentPending = clean(data.pendingCheckoutSessionId);
    if (currentPending && currentPending !== pendingSessionId && currentPending !== session.id) {
      throw new HttpsError("aborted", "Another seasonal checkout was created first. Refresh before continuing.");
    }
    tx.update(proposalRef, {
      status: "CHECKOUT_CREATED",
      seasonalPaymentLedger: updatedLedger,
      pendingCheckoutSessionId: session.id,
      paymentStatus: "pending",
      updatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    ok: true,
    proposalId,
    status: "CHECKOUT_CREATED",
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    installmentNumber: next.number,
    resumed: false,
  };
}
