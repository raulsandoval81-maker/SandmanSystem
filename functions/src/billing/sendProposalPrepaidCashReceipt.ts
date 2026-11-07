import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getResendClient, RESEND_API_KEY } from "../modules/email/resend";
import { requireProposalStaffAccess, requireProposalLocationAccess } from "../proposals/proposalAccess";

/**
 * 2C receipt delivery only. This does NOT collect money, mark a proposal PAID,
 * create a Stripe object, create an Intake token, or approve an athlete.
 * The existing Billing cash recorder is the sole payment authority.
 */
const clean = (v: unknown): string => String(v ?? "").trim();
const money = (v: number): string => (v / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (v: any): string => v?.toDate?.()?.toISOString().slice(0, 10) || clean(v).slice(0, 10);
const escapeHtml = (v: unknown): string => clean(v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

export const sendProposalPrepaidCashReceipt = onCall(
  { secrets: [RESEND_API_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Management sign-in required.");
    const actor = await requireProposalStaffAccess(req.auth.uid);
    const proposalId = clean(req.data?.proposalId);
    if (!/^P-\d{6}$/.test(proposalId)) throw new HttpsError("invalid-argument", "A valid proposal ID is required.");

    const db = getFirestore();
    const proposalRef = db.collection("proposals").doc(proposalId);
    const receiptRef = proposalRef.collection("delivery").doc("cash_check_receipt");
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal was not found.");
    const proposal = proposalSnap.data() || {};
    requireProposalLocationAccess(actor, proposal.locationId);

    const mode = clean(req.data?.mode || "send").toLowerCase();
    if (!["send", "status", "confirm_sent", "confirm_not_sent"].includes(mode)) {
      throw new HttpsError("invalid-argument", "Unsupported receipt operation.");
    }
    const payment = proposal.cashPrepayment;
    if (clean(proposal.status).toUpperCase() !== "PAID" ||
        clean(proposal.paymentStatus).toLowerCase() !== "paid" ||
        clean(proposal.paymentMethod).toLowerCase() !== "cash_prepaid" ||
        !payment || !Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
      throw new HttpsError("failed-precondition", "A verified cash/check Paid-in-Full payment is required before sending a receipt.");
    }
    if (clean(proposal.stripeCheckoutSessionId) || clean(proposal.stripeSubscriptionId)) {
      throw new HttpsError("failed-precondition", "Cash/check receipt cannot be sent on a Stripe-linked payment.");
    }

    if (mode === "status") {
      const snapshot = await receiptRef.get();
      const recorded = snapshot.data() || {};
      return {
        ok: true,
        status: clean(recorded.status) || "NOT_SENT",
        recipient: clean(recorded.recipient),
        providerId: clean(recorded.providerId),
        receiptId: clean(recorded.receiptId) || `CASH-${proposalId}`,
        requestedAt: recorded.requestedAt?.toMillis?.() || null,
        sentAt: recorded.sentAt?.toMillis?.() || null,
        resolvedAt: recorded.resolvedAt?.toMillis?.() || null,
      };
    }
    if (mode === "confirm_sent" || mode === "confirm_not_sent") {
      if (!["admin", "system_admin"].includes(actor.role)) {
        throw new HttpsError("permission-denied", "Receipt delivery resolution requires System Admin review.");
      }
      const evidence = clean(req.data?.evidence);
      const providerId = clean(req.data?.providerId);
      const confirmation = clean(req.data?.confirmation);
      if (evidence.length < 20 || evidence.length > 1000 ||
          confirmation !== (mode === "confirm_sent" ? "PROVIDER_ACCEPTED_EMAIL" : "PROVIDER_CONFIRMED_NOT_ACCEPTED") ||
          (mode === "confirm_sent" && !providerId)) {
        throw new HttpsError("invalid-argument", "Document provider evidence and type the exact confirmation before resolving.");
      }
      return db.runTransaction(async tx => {
        const previous = await tx.get(receiptRef);
        const record = previous.data() || {};
        if (record.status !== "SENDING") {
          throw new HttpsError("failed-precondition", "Only an uncertain SENDING receipt may be manually resolved.");
        }
        const resolvedStatus = mode === "confirm_sent" ? "SENT" : "FAILED";
        tx.update(receiptRef, {
          status: resolvedStatus,
          ...(mode === "confirm_sent" ? { providerId, sentAt: FieldValue.serverTimestamp() } : {}),
          resolutionEvidence: evidence,
          resolutionBy: req.auth!.uid,
          resolvedAt: FieldValue.serverTimestamp(),
        });
        tx.create(proposalRef.collection("history").doc(), {
          proposalId,
          event: mode === "confirm_sent" ? "CASH_RECEIPT_PROVIDER_ACCEPTANCE_VERIFIED" : "CASH_RECEIPT_PROVIDER_NON_ACCEPTANCE_VERIFIED",
          receiptId: clean(record.receiptId),
          recipient: clean(record.recipient),
          providerId,
          evidence,
          createdBy: req.auth!.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { ok: true, status: resolvedStatus, recipient: clean(record.recipient), receiptId: clean(record.receiptId) };
      });
    }
    const prospect = proposal.lockedSnapshot?.prospect || proposal.prospect || {};
    const expected = clean(prospect.parentEmail || prospect.primaryContactEmail || prospect.email).toLowerCase();
    const override = clean(req.data?.recipientEmail).toLowerCase();
    const recipient = override || expected;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new HttpsError("failed-precondition", "A valid parent receipt email is required.");
    }
    if (override && override !== expected && req.data?.confirmRecipient !== true) {
      throw new HttpsError("invalid-argument", "Confirm the parent email override before sending.");
    }
    const receiptId = `CASH-${proposalId}`;
    const amountCents = payment.amountCents;
    const membershipCents = payment.membershipAmountCents;
    const enrollment = payment.annualEnrollmentFee || {};
    const outstandingCents = Number(enrollment.outstandingCents);
    const feeAllocatedCents = amountCents - membershipCents;
    const method = clean(payment.paymentMethod).toLowerCase();
    if (!["cash", "check"].includes(method) ||
        !Number.isInteger(enrollment.paidWithPrepaymentCents) ||
        enrollment.paidWithPrepaymentCents !== feeAllocatedCents ||
        !Number.isInteger(membershipCents) ||
        membershipCents <= 0 || !Number.isInteger(outstandingCents) || outstandingCents < 0 ||
        feeAllocatedCents < 0) {
      throw new HttpsError("failed-precondition", "Payment allocation is incomplete.");
    }
    const paymentDate = date(payment.paymentDate);
    const startDate = date(payment.membershipStartDate);
    const paidThrough = date(payment.membershipPaidThroughDate);
    const nextBilling = date(payment.nextBillingDate || proposal.nextBillingDate);
    if (!paymentDate || !startDate || !paidThrough || !nextBilling) {
      throw new HttpsError("failed-precondition", "Receipt requires verified payment and coverage dates.");
    }

    // Reserve a single receipt delivery. Pending is intentionally fail-closed:
    // after an uncertain provider outcome, staff must investigate before retrying.
    const reservation = await db.runTransaction(async (tx) => {
      const previous = await tx.get(receiptRef);
      const current = previous.data() || {};
      if (current.status === "SENT") {
        return { status: "SENT" as const, recipient: clean(current.recipient) };
      }
      if (current.status === "SENDING") {
        throw new HttpsError("failed-precondition", "Receipt send is pending. Check delivery before retrying.");
      }
      if (previous.exists && current.status !== "FAILED") {
        throw new HttpsError("failed-precondition", "Receipt delivery requires Management review.");
      }
      tx.set(receiptRef, {
        receiptId, proposalId, status: "SENDING", recipient,
        amountCents, membershipCents, feeAllocatedCents, outstandingCents,
        method, paymentDate, startDate, paidThrough, nextBilling,
        requestedBy: req.auth!.uid, requestedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { status: "SENDING" as const, recipient };
    });
    if (reservation.status === "SENT") {
      return { ok: true, alreadySent: true, receiptId, recipient: reservation.recipient };
    }

    const description = [
      `Sandman Academy payment confirmation ${receiptId}`,
      `Payment: ${money(amountCents)} by ${method} on ${paymentDate}`,
      `Prepaid membership: ${money(membershipCents)}`,
      `Annual enrollment fee allocated: ${money(feeAllocatedCents)}`,
      `Annual enrollment fee outstanding: ${money(outstandingCents)}`,
      `Coverage: ${startDate} through ${paidThrough}`,
      `Earliest renewal: ${nextBilling} (separate approval required)`,
      "No new payment or automatic renewal has been authorized.",
      "Your separate secure Intake invitation will be issued through Sandman Management."
    ];
    const text = description.join("\n");
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#181818">
      <h1>Sandman Academy — Payment Receipt</h1>
      <p>Receipt reference: <strong>${escapeHtml(receiptId)}</strong></p>
      ${description.slice(1).map(line => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>`;

    let providerId = "";
    try {
      const result = await getResendClient().emails.send({
        from: "Sandman Combat <join@sandmancombat.com>",
        replyTo: "joinsandmancombat@gmail.com",
        to: recipient,
        subject: `Sandman Academy Paid-in-Full Receipt — ${receiptId}`,
        text, html
      });
      if (result.error) {
        // A definite provider rejection permits an explicit later retry.
        await receiptRef.update({ status: "FAILED", error: clean(result.error.message).slice(0, 250), failedAt: FieldValue.serverTimestamp() });
        throw new HttpsError("internal", "The receipt email provider rejected delivery.");
      }
      providerId = clean(result.data?.id);
      if (!providerId) {
        throw new HttpsError("failed-precondition", "Provider response lacks an acceptance ID; receipt outcome needs verification.");
      }
    } catch (error) {
      // Unknown provider/network outcomes remain SENDING, never auto-resend.
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Receipt send outcome is uncertain. Check provider delivery before retrying.");
    }

    await db.runTransaction(async tx => {
      const snapshot = await tx.get(receiptRef);
      if (snapshot.data()?.status !== "SENDING") {
        throw new HttpsError("failed-precondition", "Receipt state changed during delivery; review provider record.");
      }
      tx.update(receiptRef, { status: "SENT", providerId, sentAt: FieldValue.serverTimestamp() });
      tx.create(proposalRef.collection("history").doc(), {
        proposalId, event: "CASH_PREPAYMENT_RECEIPT_SENT", receiptId, recipient,
        providerId, createdBy: req.auth!.uid, createdAt: FieldValue.serverTimestamp()
      });
    });
    return { ok: true, alreadySent: false, receiptId, recipient };
  }
);
