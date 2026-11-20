import { FieldValue, Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v1/https";
import { isOperationalPaidProposal, isStagingEnrollmentRuntime } from "./operationalPaidProposal";

const HOURS_48 = 48 * 60 * 60 * 1000;
type Data = Record<string, any>;
const email = (value: unknown) => String(value || "").trim().toLowerCase();
const date = (value: any) => value?.toDate?.()?.toISOString().slice(0, 10) || String(value || "").slice(0, 10);

export function cashReceiptDetails(proposal: Data) {
  const payment = proposal.cashPrepayment;
  const amount = payment?.amountCents;
  const membership = payment?.membershipAmountCents;
  const allocated = payment?.annualEnrollmentFee?.paidWithPrepaymentCents;
  const outstanding = payment?.annualEnrollmentFee?.outstandingCents;
  const method = payment?.paymentMethod;
  const dates = [date(payment?.paymentDate), date(payment?.membershipStartDate),
    date(payment?.membershipPaidThroughDate), date(payment?.nextBillingDate || proposal.nextBillingDate)];
  if (!isOperationalPaidProposal(proposal) || proposal.paymentMethod !== "cash_prepaid" ||
      proposal.stripeCheckoutSessionId || proposal.stripeSubscriptionId ||
      !["cash", "check"].includes(method) || ![amount, membership, allocated, outstanding].every(Number.isSafeInteger) ||
      membership <= 0 || allocated < 0 || outstanding < 0 || amount !== membership + allocated ||
      dates.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
    throw new HttpsError("failed-precondition", "Verified Cash/Check payment, allocation, and coverage are required.");
  }
  return {amount, membership, allocated, outstanding, method, dates, currency: "usd"};
}

function proposalReceiptRecipient(proposal: Data): string {
  const locked = proposal.lockedSnapshot || {};
  const prospects = [locked.prospect, proposal.prospect];
  const contacts = [locked.contact || locked.parent, proposal.contact || proposal.parent];
  return [...prospects.flatMap(prospect => [prospect?.email, prospect?.parentEmail, prospect?.primaryContactEmail]),
    ...contacts.flatMap(contact => [contact?.email, contact?.parentEmail])]
    .map(email).find(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith(".invalid")) || "";
}

export function stripeReceiptDetails(proposal: Data, session: Data, proposalId: string) {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!isOperationalPaidProposal(proposal) || proposal.paymentMethod === "cash_prepaid" ||
      session.id !== proposal.stripeCheckoutSessionId || session.metadata?.proposalId !== proposalId ||
      !intent || intent !== proposal.stripePaymentIntentId ||
      session.payment_status !== "paid" || session.livemode !== proposal.stripeLivemode ||
      session.livemode !== !isStagingEnrollmentRuntime() ||
      !Number.isSafeInteger(session.amount_total) || session.amount_total <= 0 || session.currency !== "usd") {
    throw new HttpsError("failed-precondition", "Verified Stripe payment does not match this enrollment.");
  }
  return {amount: session.amount_total, currency: session.currency, method: "Stripe"};
}

export function receiptReservation(receipt: Data, token: Data, recipient: string, tokenId: string, now: number) {
  if (receipt.status === "SENDING" || token.twoCEmailStatus === "SENDING") {
    throw new HttpsError("failed-precondition", "Delivery outcome is uncertain. Verify the provider attempt before retrying.");
  }
  if (receipt.status === "SENT" || token.deliveryStatus === "SENT") {
    if ((receipt.status === "SENT" && email(receipt.recipient) !== recipient) ||
        (token.deliveryStatus === "SENT" && email(token.deliveredTo) !== recipient)) {
      throw new HttpsError("failed-precondition", "An existing delivery belongs to another recipient.");
    }
    if (receipt.combinedTokenId === tokenId && receipt.status === "SENT" && token.deliveryStatus === "SENT") {
      return "ALREADY_SENT";
    }
    throw new HttpsError("failed-precondition", "A delivery already exists. Use audited standalone Intake recovery if needed.");
  }
  if ((receipt.status && receipt.status !== "FAILED") || token.used === true ||
      !Number.isSafeInteger(token.exp) || token.exp <= now) {
    throw new HttpsError("failed-precondition", "An unused, unexpired Intake token and a clear receipt state are required.");
  }
  return "SEND";
}

// The receipt contains only fixed labels and verified ASCII payment fields.
export function cashReceiptPdf(lines: string[]): Buffer {
  const commands = lines.map(line =>
    "(" + line.replace(/[\\()]/g, "\\$&").replace(/[^ -~]/g, "?") + ") Tj"
  );
  const stream = ["BT", "/F1 12 Tf", "18 TL", "54 738 Td",
    commands.join("\nT*\n"), "ET", ""].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  pdf += offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function sendCombinedEnrollmentReceipt(input: {
  db: Firestore; proposalId: string; tokenId: string; recipient: string; uid: string;
  proposal: Data; token: Data; payment: Data; url: string;
  send: (lines: string[], url: string, attempt: string) => Promise<{providerId?: string; rejected?: boolean}>;
}) {
  const {db, proposalId, tokenId, recipient, uid, proposal, token, payment, url, send} = input;
  const proposalRef = db.doc(`proposals/${proposalId}`);
  const tokenRef = db.doc(`intakeTokens/${tokenId}`);
  const receiptRef = proposalRef.collection("delivery").doc(proposal.paymentMethod === "cash_prepaid" ? "cash_check_receipt" : "stripe_enrollment_receipt");
  const attempt = proposalRef.collection("history").doc().id;
  const reservation = await db.runTransaction(async tx => {
    const [receipt, latestToken, latestProposal, intake, relatedTokens] = await Promise.all([
      tx.get(receiptRef), tx.get(tokenRef), tx.get(proposalRef), tx.get(db.doc(`intakes/${tokenId}`)),
      tx.get(db.collection("intakeTokens").where("proposalId", "==", proposalId)),
    ]);
    const latest = latestToken.data() || {};
    const paid = latestProposal.data() || {};
    if (paid.paymentMethod === "cash_prepaid" && paid.earlyCashCheckIntakeTokenId) {
      throw new HttpsError("failed-precondition", "This family already started secure Intake. Use the payment receipt action once paperwork is complete.");
    }
    if (!latestToken.exists || intake.exists || !isOperationalPaidProposal(paid) ||
        paid.paymentMethod !== proposal.paymentMethod || paid.locationId !== proposal.locationId ||
        paid.stripeCheckoutSessionId !== proposal.stripeCheckoutSessionId ||
        paid.stripePaymentIntentId !== proposal.stripePaymentIntentId ||
        (paid.paymentMethod === "cash_prepaid" &&
          (JSON.stringify(cashReceiptDetails(paid)) !== JSON.stringify(payment) ||
           proposalReceiptRecipient(paid) !== recipient || email(latest.prefill?.email) !== recipient)) ||
        latest.proposalId !== proposalId || latest.locationId !== paid.locationId ||
        latest.source !== "management_enrollment" || (latest.mode || "new_athlete") !== "new_athlete" ||
        latest.intakeAudience !== token.intakeAudience || !["parent_guardian", "adult_athlete"].includes(latest.intakeAudience) ||
        (email(latest.prefill?.email) && !email(latest.prefill.email).endsWith(".invalid") && email(latest.prefill.email) !== recipient)) {
      throw new HttpsError("failed-precondition", "Payment or Intake identity changed or does not match the recipient.");
    }
    if (relatedTokens.docs.some(doc => {
      const other = doc.data();
      return doc.id !== tokenId && (other.used === true || other.deliveryStatus === "SENT" || other.twoCEmailStatus === "SENDING");
    })) {
      throw new HttpsError("failed-precondition", "Another Intake token already has delivery or submission history.");
    }
    const gate = receiptReservation(receipt.data() || {}, latest, recipient, tokenId, Date.now());
    if (gate === "ALREADY_SENT") return gate;
    tx.set(receiptRef, {proposalId, receiptId: `${paid.paymentMethod === "cash_prepaid" ? "CASH" : "STRIPE"}-${proposalId}`, status: "SENDING", recipient,
      combinedTokenId: tokenId, combinedAttempt: attempt, payment, requestedBy: uid, requestedAt: FieldValue.serverTimestamp()}, {merge: true});
    tx.update(tokenRef, {combinedAttempt: attempt, twoCEmailStatus: "SENDING", twoCEmailRecipient: recipient,
      twoCEmailRequestedBy: uid, twoCEmailRequestedAt: FieldValue.serverTimestamp(), exp: Date.now() + HOURS_48});
    return gate;
  });
  if (reservation === "ALREADY_SENT") return {ok: true, alreadySent: true, recipient, exp: token.exp};

  const money = (cents: number) => (cents / 100).toLocaleString("en-US", {style: "currency", currency: payment.currency.toUpperCase()});
  const lines = [`Sandman Academy payment receipt for ${proposalId}`, `Received: ${money(payment.amount)} by ${payment.method}`];
  if (payment.dates) {
    const [paidOn, start, through, renewal] = payment.dates;
    lines.push(`Receipt number: CASH-${proposalId}`, `Payment date: ${paidOn}`,
      `Paid-in-full membership: ${money(payment.membership)}`,
      `Annual enrollment fee paid with this payment: ${money(payment.allocated)}`,
      `Annual enrollment fee remaining: ${money(payment.outstanding)}`,
      `Coverage: ${start} through ${through}`, `Earliest renewal: ${renewal}`,
      "Renewal requires separate approval. There is no automatic renewal.");
  }
  let result;
  try {
    result = await send(lines, url, attempt);
  } catch {
    throw new HttpsError("failed-precondition", "Provider acceptance is uncertain. Verify delivery before retrying.");
  }
  if (!result.rejected && !result.providerId) {
    throw new HttpsError("failed-precondition", "Provider acceptance is uncertain. Verify delivery before retrying.");
  }
  const exp = await finishCombinedDelivery({db, proposalId, tokenId, receiptRef, attempt, recipient, uid,
    providerId: result.providerId || "", accepted: !result.rejected});
  if (result.rejected) throw new HttpsError("internal", "The email provider rejected delivery.");
  return {ok: true, recipient, exp, resendEmailId: result.providerId};
}

export async function finishCombinedDelivery(input: {
  db: Firestore; proposalId: string; tokenId: string; receiptRef: FirebaseFirestore.DocumentReference;
  attempt: string; recipient: string; uid: string; providerId: string; accepted: boolean; evidence?: string;
}) {
  const {db, proposalId, tokenId, receiptRef, attempt, recipient, uid, providerId, accepted, evidence} = input;
  const tokenRef = db.doc(`intakeTokens/${tokenId}`);
  return db.runTransaction(async tx => {
    const [receipt, token] = await Promise.all([tx.get(receiptRef), tx.get(tokenRef)]);
    const r = receipt.data() || {}, t = token.data() || {};
    if (r.status !== "SENDING" || t.twoCEmailStatus !== "SENDING" ||
        r.combinedTokenId !== tokenId || r.combinedAttempt !== attempt || t.combinedAttempt !== attempt ||
        r.recipient !== recipient || t.twoCEmailRecipient !== recipient || (accepted && !providerId)) {
      throw new HttpsError("failed-precondition", "Combined delivery attempt changed. Review provider evidence.");
    }
    const status = accepted ? "SENT" : "FAILED";
    const at = FieldValue.serverTimestamp();
    const exp = t.used === true || evidence ? t.exp : Date.now() + HOURS_48;
    tx.update(receiptRef, {status, ...(accepted ? {providerId, sentAt: at} : {}),
      ...(evidence ? {resolutionEvidence: evidence, resolutionBy: uid, resolvedAt: at} : {})});
    tx.update(tokenRef, {twoCEmailStatus: status, ...(accepted ? {
      deliveryStatus: "SENT", deliveryMethod: "email", deliveredTo: recipient, deliveredAt: at,
      deliveredByUid: uid, resendEmailId: providerId, exp,
    } : {}), ...(evidence ? {twoCResolutionEvidence: evidence, twoCResolvedBy: uid, twoCResolvedAt: at} : {})});
    const history = db.doc(`proposals/${proposalId}`).collection("history");
    const audit = {proposalId, intakeTokenId: tokenId, recipient, providerId, combinedAttempt: attempt,
      createdBy: uid, createdAt: at, ...(evidence ? {evidence} : {})};
    tx.create(history.doc(), {...audit, event: accepted ? "COMBINED_RECEIPT_SENT" : "COMBINED_RECEIPT_NOT_ACCEPTED"});
    tx.create(history.doc(), {...audit, event: accepted ? "INTAKE_INVITE_SENT" : "COMBINED_INTAKE_NOT_ACCEPTED"});
    return exp;
  });
}
