import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import {
  createProposalReviewToken,
  hashProposalReviewToken,
} from "./proposalClientReview";

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";

import {
  getResendClient,
  RESEND_API_KEY,
} from "../modules/email/resend";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown): string {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const issueProposalEnrollmentHandoff =
  onCall(
    {
      secrets: [RESEND_API_KEY],
    },
    async (req) => {
      const proposalId =
        clean(req.data?.proposalId);

      const delivery =
        clean(req.data?.delivery || "local")
          .toLowerCase();

      const clientReviewToken =
        clean(req.data?.clientReviewToken);

      if (!proposalId) {
        throw new HttpsError(
          "invalid-argument",
          "proposalId is required."
        );
      }

      if (!["local", "email"].includes(delivery)) {
        throw new HttpsError(
          "invalid-argument",
          "Unsupported enrollment delivery method."
        );
      }

      const db = getFirestore();

      const proposalRef =
        db.collection("proposals")
          .doc(proposalId);

      const proposalSnap =
        await proposalRef.get();

      if (!proposalSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Proposal ${proposalId} was not found.`
        );
      }

      const proposal =
        proposalSnap.data() || {};

      let actorUid = "client";

      if (req.auth) {
        const access =
          await requireProposalStaffAccess(
            req.auth.uid
          );

        requireProposalLocationAccess(
          access,
          proposal.locationId
        );

        actorUid = req.auth.uid;
      } else {
        if (!clientReviewToken) {
          throw new HttpsError(
            "unauthenticated",
            "A valid proposal review link or Management sign-in is required."
          );
        }

        const review =
          proposal.clientReview || {};

        const tokenMatches =
          hashProposalReviewToken(
            clientReviewToken
          ) === clean(review.tokenHash);

        const reviewExpiresAt =
          review.expiresAt;

        if (
          !tokenMatches ||
          !(reviewExpiresAt instanceof Timestamp) ||
          reviewExpiresAt.toMillis() < Date.now()
        ) {
          throw new HttpsError(
            "permission-denied",
            "This proposal review link is invalid or expired."
          );
        }

        if (delivery !== "local") {
          throw new HttpsError(
            "permission-denied",
            "Only Management may email a new enrollment verification link."
          );
        }
      }

      const status =
        clean(proposal.status)
          .toUpperCase();

      if (
        ![
          "READY_FOR_CHECKOUT",
          "CHECKOUT_CREATED",
        ].includes(status)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only checkout-ready proposals may enter final enrollment verification."
        );
      }

      const rawToken =
        createProposalReviewToken();

      const tokenHash =
        hashProposalReviewToken(
          rawToken
        );

      const expiresAt =
        Timestamp.fromMillis(
          Date.now() +
          7 * 24 * 60 * 60 * 1000
        );

      const prospect =
        proposal.prospect &&
        typeof proposal.prospect === "object"
          ? proposal.prospect as Record<string, unknown>
          : {};

      const recipient =
        clean(prospect.email)
          .toLowerCase();

      if (
        delivery === "email" &&
        !recipient
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This proposal does not have a client email address."
        );
      }

      const enrollmentPath =
        "/connect/enrollment/" +
        `?proposalId=${encodeURIComponent(
          proposalId
        )}` +
        `&token=${encodeURIComponent(
          rawToken
        )}`;

      await proposalRef.update({
        enrollmentHandoff: {
          tokenHash,
          expiresAt,
          issuedBy:
            actorUid,
          issuedAt:
            FieldValue.serverTimestamp(),
          delivery,
          recipient:
            delivery === "email"
              ? recipient
              : null,
        },

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      await proposalRef
        .collection("history")
        .add({
          proposalId,
          event:
            "ENROLLMENT_VERIFICATION_ISSUED",
          delivery,
          recipient:
            delivery === "email"
              ? recipient
              : null,
          createdBy:
            actorUid,
          createdAt:
            FieldValue.serverTimestamp(),
        });

      let emailId = "";

      if (delivery === "email") {
        const contactName =
          clean(
            prospect.primaryContactName ||
            prospect.familyName
          ) || "there";

        const url =
          `https://sandmancombat.com${enrollmentPath}`;

        const resend =
          getResendClient();

        const email =
          await resend.emails.send({
            from:
              "Sandman Combat <join@sandmancombat.com>",
            replyTo:
              "joinsandmancombat@gmail.com",
            to:
              recipient,
            subject:
              "Complete your Sandman Academy enrollment verification",
            text: [
              `Hi ${contactName},`,
              "",
              "Your approved Sandman Academy proposal is ready for final enrollment verification.",
              "",
              "Please review the locked enrollment details, complete the final enrollment agreement verification, and then continue to secure Stripe checkout.",
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
        <div style="margin-top:8px;color:#fff;font-size:25px;font-weight:800;">Final Enrollment Verification</div>
      </div>
      <div style="padding:30px 28px;">
        <p style="font-size:17px;font-weight:700;">Hi ${escapeHtml(contactName)},</p>
        <p style="font-size:16px;line-height:1.7;color:#27272a;">
          Your approved proposal is ready for final enrollment verification.
          Review the locked enrollment details, complete the final agreement verification,
          and then continue to secure Stripe checkout.
        </p>
        <div style="margin:26px 0;text-align:center;">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#171717;color:#fff8e8;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px;">
            Complete Enrollment Verification
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
          throw new HttpsError(
            "internal",
            email.error.message ||
            "The email provider rejected the enrollment message."
          );
        }

        emailId =
          email.data?.id || "";

        await proposalRef.update({
          "enrollmentHandoff.emailSentAt":
            FieldValue.serverTimestamp(),
          "enrollmentHandoff.emailProviderId":
            emailId,
          updatedAt:
            FieldValue.serverTimestamp(),
        });
      }

      return {
        ok: true,
        proposalId,
        status,
        delivery,
        recipient:
          delivery === "email"
            ? recipient
            : undefined,
        enrollmentPath,
        expiresAt:
          expiresAt.toDate().toISOString(),
        emailId:
          emailId || undefined,
      };
    }
  );
