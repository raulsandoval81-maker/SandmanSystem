"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueProposalClientReview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
const proposalClientReview_1 = require("./proposalClientReview");
const resend_1 = require("../modules/email/resend");
function escapeHtml(value) {
    return (0, proposalClientReview_1.cleanReviewString)(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function buildReviewEmail(input) {
    const contactName = input.contactName || "there";
    const safeContactName = escapeHtml(contactName);
    const safeReviewUrl = escapeHtml(input.reviewUrl);
    const subject = "Review your Sandman Academy membership proposal";
    const text = [
        `Hi ${contactName},`,
        "",
        "Your Sandman Academy membership proposal is ready for final review.",
        "",
        "Please review the membership details, payment schedule, and start information. If everything looks correct, accept the proposal to continue to Review & Confirm before secure payment.",
        "",
        input.reviewUrl,
        "",
        "If something needs to be changed, use the change-request option on the review page instead of submitting payment.",
        "",
        "Coach Sandoval",
        "Sandman Academy of Combat & Fitness™",
    ].join("\n");
    const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#111111;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="padding:28px 14px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #2d2d2d;">
      <div style="background:#050505;padding:28px 26px;text-align:center;">
        <div style="color:#d3b469;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">
          Sandman Academy
        </div>
        <div style="margin-top:8px;color:#ffffff;font-size:25px;font-weight:800;">
          Your Membership Proposal Is Ready
        </div>
      </div>

      <div style="padding:30px 28px;">
        <div style="font-size:17px;font-weight:700;margin-bottom:18px;">
          Hi ${safeContactName},
        </div>

        <div style="font-size:16px;line-height:1.7;color:#27272a;">
          Your Sandman Academy membership proposal is ready for final review.
          Please review the membership details, payment schedule, and start information.
          If everything looks correct, accept the proposal to continue to Review & Confirm before secure payment.
        </div>

        <div style="margin:26px 0;text-align:center;">
          <a href="${safeReviewUrl}" style="display:inline-block;background:#171717;color:#fff8e8;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px;">
            Review &amp; Accept Proposal
          </a>
        </div>

        <div style="font-size:14px;line-height:1.6;color:#52525b;">
          If something needs to be changed, use the change-request option on the review page instead of submitting payment.
        </div>

        <div style="margin-top:28px;font-size:15px;line-height:1.6;">
          <strong>Coach Sandoval</strong><br>
          Sandman Academy of Combat &amp; Fitness™
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();
    return {
        subject,
        text,
        html,
    };
}
exports.issueProposalClientReview = (0, https_1.onCall)({
    secrets: [resend_1.RESEND_API_KEY],
}, async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to issue a client proposal review.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const proposalId = (0, proposalClientReview_1.cleanReviewString)(req.data?.proposalId);
    const delivery = (0, proposalClientReview_1.cleanReviewString)(req.data?.delivery).toLowerCase();
    const sendEmail = delivery === "email";
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    if (delivery &&
        delivery !== "email") {
        throw new https_1.HttpsError("invalid-argument", "Unsupported client review delivery method.");
    }
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals")
        .doc(proposalId);
    const rawToken = (0, proposalClientReview_1.createProposalReviewToken)();
    const tokenHash = (0, proposalClientReview_1.hashProposalReviewToken)(rawToken);
    const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() +
        7 * 24 * 60 * 60 * 1000);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(proposalRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
        }
        const proposal = snap.data() || {};
        (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
        const status = (0, proposalClientReview_1.cleanReviewString)(proposal.status);
        if (status !== "REVIEW" &&
            status !==
                "AWAITING_CLIENT_SIGNATURE") {
            throw new https_1.HttpsError("failed-precondition", "Only REVIEW proposals may be sent to the client.");
        }
        const prospect = proposal.prospect &&
            typeof proposal.prospect === "object"
            ? proposal.prospect
            : {};
        const appointmentId = (0, proposalClientReview_1.cleanReviewString)(prospect.appointmentId);
        let recipient = (0, proposalClientReview_1.cleanReviewString)(prospect.email).toLowerCase();
        let recipientSource = "proposal";
        if (appointmentId) {
            const appointmentRef = db.collection("admissions_appointments").doc(appointmentId);
            const appointmentSnap = await tx.get(appointmentRef);
            if (!appointmentSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", "The appointment connected to this proposal could not be found.");
            }
            const appointmentEmail = (0, proposalClientReview_1.cleanReviewString)(appointmentSnap.get("email")).toLowerCase();
            if (appointmentEmail) {
                recipient =
                    appointmentEmail;
                recipientSource =
                    "appointment";
            }
        }
        if (sendEmail &&
            !recipient) {
            throw new https_1.HttpsError("failed-precondition", "This proposal does not have a client email address.");
        }
        const contactName = (0, proposalClientReview_1.cleanReviewString)(prospect.primaryContactName ||
            prospect.familyName);
        const proposalForSnapshot = {
            ...proposal,
            prospect: {
                ...prospect,
                email: recipient,
            },
        };
        const existingSnapshot = proposal.clientReview?.snapshot;
        const clientSnapshot = existingSnapshot ||
            (0, proposalClientReview_1.buildClientProposalSnapshot)(proposalId, proposalForSnapshot);
        const historyRef = proposalRef
            .collection("history")
            .doc();
        tx.update(proposalRef, {
            status: "AWAITING_CLIENT_SIGNATURE",
            "prospect.email": recipient || null,
            "prospect.emailSource": recipientSource,
            clientReview: {
                tokenHash,
                expiresAt,
                snapshotVersion: 1,
                snapshot: clientSnapshot,
                issuedBy: req.auth.uid,
                issuedAt: firestore_1.FieldValue.serverTimestamp(),
            },
            updatedBy: req.auth.uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(historyRef, {
            proposalId,
            event: "CLIENT_REVIEW_ISSUED",
            fromStatus: status,
            toStatus: "AWAITING_CLIENT_SIGNATURE",
            delivery: sendEmail
                ? "email"
                : "local",
            recipient: sendEmail
                ? recipient
                : null,
            recipientSource,
            createdBy: req.auth.uid,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            status: "AWAITING_CLIENT_SIGNATURE",
            recipient,
            recipientSource,
            contactName,
        };
    });
    const reviewPath = "/connect/proposals/review/" +
        `?proposalId=${encodeURIComponent(proposalId)}` +
        `&token=${encodeURIComponent(rawToken)}`;
    let emailId = "";
    if (sendEmail) {
        const reviewUrl = `https://sandmancombat.com${reviewPath}`;
        const email = buildReviewEmail({
            contactName: result.contactName,
            reviewUrl,
        });
        const resend = (0, resend_1.getResendClient)();
        const emailResult = await resend.emails.send({
            from: "Sandman Combat <join@sandmancombat.com>",
            replyTo: "joinsandmancombat@gmail.com",
            to: result.recipient,
            subject: email.subject,
            text: email.text,
            html: email.html,
        });
        if (emailResult.error) {
            throw new https_1.HttpsError("internal", emailResult.error.message ||
                "The email provider rejected the proposal review message.");
        }
        emailId =
            emailResult.data?.id || "";
        await proposalRef.update({
            "clientReview.emailSentAt": firestore_1.FieldValue.serverTimestamp(),
            "clientReview.emailRecipient": result.recipient,
            "clientReview.emailRecipientSource": result.recipientSource,
            "clientReview.emailProviderId": emailId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        await proposalRef
            .collection("history")
            .add({
            proposalId,
            event: "CLIENT_REVIEW_EMAIL_SENT",
            to: result.recipient,
            recipientSource: result.recipientSource,
            emailProviderId: emailId,
            createdBy: req.auth.uid,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    return {
        ok: true,
        proposalId,
        ...result,
        delivery: sendEmail
            ? "email"
            : "local",
        recipient: sendEmail
            ? result.recipient
            : undefined,
        emailId: sendEmail
            ? emailId
            : undefined,
        reviewPath,
        expiresAt: expiresAt
            .toDate()
            .toISOString(),
    };
});
