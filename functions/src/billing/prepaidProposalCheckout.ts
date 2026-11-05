import type Stripe from "stripe";
import { FieldValue, Firestore, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { lockedPrepaidTerms, paymentArrangement, prepaidFingerprint } from "./paymentArrangement";

export async function createPrepaidProposalCheckout(input: {
  stripe: Stripe; db: Firestore; proposalId: string; actorUid: string; publicBaseUrl: string;
}) {
  const {stripe, db, proposalId, actorUid, publicBaseUrl} = input;
  const ref = db.collection("proposals").doc(proposalId);
  // Claim the immutable signed terms before the external request. Concurrent
  // callers use exactly the same Stripe idempotency key, including after a crash.
  const proposal: Record<string, any> = await db.runTransaction(async tx => {
    const snap = await tx.get(ref); const p = snap.data() || {};
    if (!["READY_FOR_CHECKOUT", "CHECKOUT_CREATED"].includes(p.status) ||
        paymentArrangement(p.lockedSnapshot?.pricing || {}) !== "prepaid_stripe" ||
        p.enrollmentConfirmation?.termsConfirmed !== true || !p.enrollmentConfirmation?.confirmedAt ||
        p.cashPrepayment || p.prepaidPayment || p.stripeSubscriptionId || p.stripePaymentIntentId ||
        (p.priorPayments || []).length) {
      throw new HttpsError("failed-precondition", "This proposal is not eligible for one-time prepaid checkout.");
    }
    lockedPrepaidTerms(p);
    const fingerprint = prepaidFingerprint(p);
    if (p.prepaidCheckout && !p.prepaidCheckout.sessionId &&
        (!(p.prepaidCheckout.createdAt instanceof Timestamp) ||
         Date.now() - p.prepaidCheckout.createdAt.toMillis() >= 23 * 60 * 60 * 1000)) {
      throw new HttpsError("failed-precondition", "Prepaid checkout recovery window expired; reconcile Stripe before retrying.");
    }
    if (p.prepaidCheckout && p.prepaidCheckout.fingerprint !== fingerprint) {
      throw new HttpsError("failed-precondition", "The prepaid checkout claim no longer matches signed terms.");
    }
    if (!p.prepaidCheckout && (p.pendingCheckoutSessionId || p.stripeCheckoutSessionId || p.stripeCustomerId)) {
      throw new HttpsError("failed-precondition", "Existing Stripe activity requires Management review.");
    }
    if (!p.prepaidCheckout) tx.update(ref, {prepaidCheckout: {fingerprint, createdAt: FieldValue.serverTimestamp()}});
    return {...p, fingerprint};
  });
  const terms = lockedPrepaidTerms(proposal);
  const savedSessionId = proposal.prepaidCheckout?.sessionId;
  if (savedSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(savedSessionId);
    if (existing.status === "open" && existing.url && existing.payment_status === "unpaid") {
      return {ok: true, proposalId, checkoutSessionId: existing.id, checkoutUrl: existing.url, resumed: true};
    }
    throw new HttpsError("failed-precondition", "Existing prepaid checkout requires reconciliation or Management recovery; another charge will not be created.");
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{price_data: {currency: "usd", unit_amount: terms.amountCents,
      product_data: {name: `${terms.monthsCovered}-month prepaid membership`,
        description: `Coverage ${terms.membershipStartDate} through ${terms.paidThroughDate}; annual fee allocation ${(terms.annualEnrollmentFee.paidWithPrepaymentCents / 100).toFixed(2)} USD. No automatic renewal.`}}, quantity: 1}],
    customer_creation: "always",
    customer_email: proposal.prospect?.email || undefined,
    client_reference_id: proposalId,
    metadata: {proposalId, source: "membership_prepaid", fingerprint: proposal.fingerprint},
    payment_intent_data: {metadata: {proposalId, source: "membership_prepaid", fingerprint: proposal.fingerprint}},
    success_url: `${publicBaseUrl}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicBaseUrl}/billing/cancel/`,
    custom_text: {submit: {message: "One-time prepaid membership. No subscription or automatic renewal is authorized."}},
  }, {idempotencyKey: `membership-prepaid-${proposalId}-${proposal.fingerprint}`});
  if (!session.url || session.status !== "open") throw new HttpsError("failed-precondition", "Prepaid Checkout is not open; Management recovery is required.");
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref); const p = snap.data() || {};
    if (p.prepaidPayment?.checkoutSessionId === session.id) return;
    if (prepaidFingerprint(p) !== proposal.fingerprint ||
        !["READY_FOR_CHECKOUT", "CHECKOUT_CREATED"].includes(p.status) ||
        (p.pendingCheckoutSessionId && p.pendingCheckoutSessionId !== session.id)) {
      throw new HttpsError("aborted", "Prepaid checkout state changed; stop and reconcile the existing session.");
    }
    tx.update(ref, {status: "CHECKOUT_CREATED", pendingCheckoutSessionId: session.id,
      "prepaidCheckout.sessionId": session.id, paymentStatus: "pending", updatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp()});
  });
  return {ok: true, proposalId, status: "CHECKOUT_CREATED", checkoutSessionId: session.id, checkoutUrl: session.url};
}

// Called only from the existing signature-verified webhook dispatcher.
export async function handlePrepaidProposalPayment(session: Stripe.Checkout.Session) {
  if (session.metadata?.source !== "membership_prepaid") return null;
  const id = String(session.metadata.proposalId || "");
  if (!id) throw new Error("Missing prepaid proposal identity.");
  if (session.payment_status !== "paid") return id;
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intent || session.mode !== "payment" || session.subscription || session.currency !== "usd") {
    throw new Error("Invalid one-time prepaid payment evidence.");
  }
  const ref = getFirestore().collection("proposals").doc(id);
  await getFirestore().runTransaction(async tx => {
    const snap = await tx.get(ref); const p = snap.data() || {};
    const terms = lockedPrepaidTerms(p);
    if (paymentArrangement(p.lockedSnapshot.pricing) !== "prepaid_stripe" ||
        session.metadata?.fingerprint !== prepaidFingerprint(p) || session.amount_total !== terms.amountCents ||
        p.enrollmentConfirmation?.termsConfirmed !== true || !p.enrollmentConfirmation?.confirmedAt) {
      throw new Error("Stripe payment differs from the accepted prepaid agreement.");
    }
    if (p.prepaidPayment) {
      if (p.prepaidPayment.checkoutSessionId === session.id && p.prepaidPayment.paymentIntentId === intent) return;
      throw new Error("Prepaid membership already paid by another payment.");
    }
    if (p.status !== "CHECKOUT_CREATED" || p.pendingCheckoutSessionId !== session.id ||
        p.prepaidCheckout?.sessionId !== session.id || p.cashPrepayment || p.stripeSubscriptionId) {
      throw new Error("Prepaid payment does not match pending checkout.");
    }
    const receipt = {...terms, membershipPaidInFull: true, checkoutSessionId: session.id,
      paymentIntentId: intent, paymentMethod: "stripe", paymentDate: Timestamp.now(), paymentDateSource: "verified_webhook_confirmation",
      membershipStartDate: Timestamp.fromDate(new Date(`${terms.membershipStartDate}T12:00:00Z`)),
      membershipPaidThroughDate: Timestamp.fromDate(new Date(`${terms.paidThroughDate}T12:00:00Z`)),
      nextBillingDate: Timestamp.fromDate(new Date(`${terms.nextBillingDate}T12:00:00Z`))};
    tx.update(ref, {status: "PAID", paymentStatus: "paid", paymentMethod: "stripe_prepaid",
      paidAt: FieldValue.serverTimestamp(), prepaidPayment: receipt,
      membershipPaidThroughDate: receipt.membershipPaidThroughDate, nextBillingDate: receipt.nextBillingDate,
      billingFollowUpStatus: "RENEWAL_AUTOPAY_APPROVAL_REQUIRED",
      stripeCheckoutSessionId: session.id, stripePaymentIntentId: intent,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
      stripeLivemode: session.livemode, pendingCheckoutSessionId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()});
    tx.create(ref.collection("history").doc(), {proposalId: id, event: "STRIPE_PREPAYMENT_RECORDED",
      ...receipt, createdBy: "stripe", createdAt: FieldValue.serverTimestamp()});
  });
  return id;
}
