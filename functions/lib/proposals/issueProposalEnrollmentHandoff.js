"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueProposalEnrollmentHandoff = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalClientReview_1 = require("./proposalClientReview");
const proposalAccess_1 = require("./proposalAccess");
const resend_1 = require("../modules/email/resend");
function clean(value) {
    return String(value ?? "").trim();
}
function escapeHtml(value) {
    return clean(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
exports.issueProposalEnrollmentHandoff = (0, https_1.onCall)({
    secrets: [resend_1.RESEND_API_KEY],
}, async (req) => {
    const proposalId = clean(req.data?.proposalId);
    const delivery = clean(req.data?.delivery || "local")
        .toLowerCase();
    const clientReviewToken = clean(req.data?.clientReviewToken);
    const existingEnrollmentToken = clean(req.data?.existingEnrollmentToken);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    if (!["local", "email"].includes(delivery)) {
        throw new https_1.HttpsError("invalid-argument", "Unsupported enrollment delivery method.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals")
        .doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) {
        throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
    }
    const proposal = proposalSnap.data() || {};
    let actorUid = "client";
    if (clientReviewToken) {
        const review = proposal.clientReview || {};
        const tokenMatches = (0, proposalClientReview_1.hashProposalReviewToken)(clientReviewToken) === clean(review.tokenHash);
        const reviewExpiresAt = review.expiresAt;
        if (!tokenMatches ||
            !(reviewExpiresAt instanceof firestore_1.Timestamp) ||
            reviewExpiresAt.toMillis() < Date.now()) {
            throw new https_1.HttpsError("permission-denied", "This proposal review link is invalid or expired.");
        }
        if (delivery !== "local") {
            throw new https_1.HttpsError("permission-denied", "Only Management may email a new Review & Confirm link.");
        }
    }
    else if (req.auth) {
        const access = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
        (0, proposalAccess_1.requireProposalLocationAccess)(access, proposal.locationId);
        actorUid = req.auth.uid;
    }
    else {
        throw new https_1.HttpsError("unauthenticated", "A valid proposal review link or Management sign-in is required.");
    }
    const status = clean(proposal.status)
        .toUpperCase();
    if (![
        "READY_FOR_CHECKOUT",
        "CHECKOUT_CREATED",
    ].includes(status)) {
        throw new https_1.HttpsError("failed-precondition", "Only checkout-ready proposals may enter Review & Confirm.");
    }
    const currentHandoff = proposal.enrollmentHandoff || {};
    const currentExpiresAt = currentHandoff.expiresAt;
    const canReuseExistingToken = Boolean(existingEnrollmentToken &&
        (0, proposalClientReview_1.hashProposalReviewToken)(existingEnrollmentToken) ===
            clean(currentHandoff.tokenHash) &&
        currentExpiresAt instanceof
            firestore_1.Timestamp &&
        currentExpiresAt.toMillis() >
            Date.now());
    const rawToken = canReuseExistingToken
        ? existingEnrollmentToken
        : (0, proposalClientReview_1.createProposalReviewToken)();
    const tokenHash = (0, proposalClientReview_1.hashProposalReviewToken)(rawToken);
    const expiresAt = canReuseExistingToken
        ? currentExpiresAt
        : firestore_1.Timestamp.fromMillis(Date.now() +
            7 * 24 * 60 * 60 * 1000);
    const prospect = proposal.prospect &&
        typeof proposal.prospect === "object"
        ? proposal.prospect
        : {};
    const recipient = clean(prospect.email)
        .toLowerCase();
    if (delivery === "email" &&
        !recipient) {
        throw new https_1.HttpsError("failed-precondition", "This proposal does not have a client email address.");
    }
    const enrollmentPath = "/connect/enrollment/" +
        `?proposalId=${encodeURIComponent(proposalId)}` +
        `&token=${encodeURIComponent(rawToken)}`;
    await proposalRef.update({
        enrollmentHandoff: {
            tokenHash,
            expiresAt,
            issuedBy: actorUid,
            issuedAt: canReuseExistingToken
                ? (currentHandoff.issuedAt ||
                    firestore_1.FieldValue.serverTimestamp())
                : firestore_1.FieldValue.serverTimestamp(),
            delivery,
            recipient: delivery === "email"
                ? recipient
                : null,
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await proposalRef
        .collection("history")
        .add({
        proposalId,
        event: "ENROLLMENT_VERIFICATION_ISSUED",
        delivery,
        recipient: delivery === "email"
            ? recipient
            : null,
        createdBy: actorUid,
        reusedPreparedLink: canReuseExistingToken,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    let emailId = "";
    if (delivery === "email") {
        const contactName = clean(prospect.primaryContactName ||
            prospect.familyName) || "there";
        const url = `https://sandmancombat.com${enrollmentPath}`;
        const resend = (0, resend_1.getResendClient)();
        const email = await resend.emails.send({
            from: "Sandman Combat <join@sandmancombat.com>",
            replyTo: "joinsandmancombat@gmail.com",
            to: recipient,
            subject: "Review & Confirm your Sandman Academy enrollment",
            text: [
                `Hi ${contactName},`,
                "",
                "Your approved Sandman Academy proposal is ready for Review & Confirm.",
                "",
                "Please review and confirm the locked enrollment and billing details, then continue to secure Stripe payment.",
                "",
                url,
                "",
                "Coach Sandoval",
                "Sandman Academy of Combat & Fitness™",
            ].join("\n"),
            html: `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="padding:28px 14px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;">
      <div style="background:#050505;padding:28px 26px;text-align:center;">
        <div style="color:#d3b469;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Sandman Academy</div>
        <div style="margin-top:8px;color:#fff;font-size:25px;font-weight:800;">Review & Confirm</div>
      </div>
      <div style="padding:30px 28px;">
        <p style="font-size:17px;font-weight:700;">Hi ${escapeHtml(contactName)},</p>
        <p style="font-size:16px;line-height:1.7;color:#27272a;">
          Your approved proposal is ready for Review & Confirm.
          Review and confirm the locked enrollment and billing details,
          then continue to secure Stripe payment.
        </p>
        <div style="margin:26px 0;text-align:center;">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#171717;color:#fff8e8;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px;">
            Review & Confirm Enrollment
          </a>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#52525b;">
          This secure link expires in 7 days.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`.trim(),
        });
        if (email.error) {
            throw new https_1.HttpsError("internal", email.error.message ||
                "The email provider rejected the enrollment message.");
        }
        emailId =
            email.data?.id || "";
        await proposalRef.update({
            "enrollmentHandoff.emailSentAt": firestore_1.FieldValue.serverTimestamp(),
            "enrollmentHandoff.emailProviderId": emailId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    return {
        ok: true,
        proposalId,
        status,
        delivery,
        recipient: delivery === "email"
            ? recipient
            : undefined,
        enrollmentPath,
        expiresAt: expiresAt.toDate().toISOString(),
        emailId: emailId || undefined,
        reusedPreparedLink: canReuseExistingToken,
    };
});
