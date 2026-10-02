import * as functions from "firebase-functions";
import {
  FieldValue,
  getFirestore
} from "firebase-admin/firestore";

import {
  getResendClient,
  RESEND_API_KEY
} from "../modules/email/resend";

import {
  MANAGEMENT_STAFF_ROLES,
  requireActiveStaff,
  requireStaffLocation
} from "../services/staffAuthorization";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function escapeHtml(value: unknown): string {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function intakeUrl(
  tokenId: string,
  intakeAudience: string
): string {
  const route =
    intakeAudience === "adult_athlete"
      ? "/intake-athlete/"
      : "/intake-parent/";

  return `https://sandmancombat.com${route}?invite=${encodeURIComponent(tokenId)}`;
}

function isOperationalPaidProposal(
  proposal: Record<string, any>
): boolean {
  const status = clean(proposal.status).toUpperCase();
  const paymentStatus =
    clean(proposal.paymentStatus).toLowerCase();
  const checkoutSessionId =
    clean(proposal.stripeCheckoutSessionId);

  const isLiveSession =
    proposal.stripeLivemode === true ||
    checkoutSessionId.startsWith("cs_live_");

  return (
    status === "PAID" &&
    paymentStatus === "paid" &&
    Boolean(proposal.paidAt) &&
    Boolean(checkoutSessionId) &&
    !checkoutSessionId.startsWith("cs_test_") &&
    isLiveSession
  );
}

export const sendEnrollmentIntakeEmail =
  functions
    .runWith({
      secrets: [RESEND_API_KEY]
    })
    .https
    .onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Management sign-in is required."
        );
      }

      const actor = await requireActiveStaff(
        context.auth.uid,
        MANAGEMENT_STAFF_ROLES,
        "Active Management access is required."
      );

      const tokenId = clean(data?.tokenId);

      if (!tokenId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Intake token is required."
        );
      }

      const tokenRef =
        db.doc(`intakeTokens/${tokenId}`);

      const tokenSnap =
        await tokenRef.get();

      if (!tokenSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Intake handoff not found."
        );
      }

      const token = tokenSnap.data() || {};

      if (
        clean(token.source).toLowerCase() !==
          "management_enrollment" ||
        clean(token.mode || "new_athlete").toLowerCase() !==
          "new_athlete"
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This is not an Enrollment intake handoff."
        );
      }

      if (token.used === true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This intake has already been submitted."
        );
      }

      const exp = Number(token.exp || 0);

      if (exp && exp < Date.now()) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This intake link has expired. Create a new handoff."
        );
      }

      const proposalId = clean(token.proposalId);

      if (!proposalId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Enrollment proposal is missing."
        );
      }

      const proposalSnap =
        await db.doc(`proposals/${proposalId}`).get();

      if (!proposalSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Enrollment proposal not found."
        );
      }

      const proposal = proposalSnap.data() || {};

      requireStaffLocation(
        actor,
        clean(token.locationId || proposal.locationId),
        "This enrollment is outside your Management location scope."
      );

      if (!isOperationalPaidProposal(proposal)) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Intake email can only be sent for a live paid enrollment."
        );
      }

      const recipient =
        normalizeEmail(token.prefill?.email);

      if (!recipient || !recipient.includes("@")) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "No valid intake email is attached to this enrollment."
        );
      }

      const intakeAudience =
        clean(token.intakeAudience).toLowerCase() ===
          "adult_athlete"
          ? "adult_athlete"
          : "parent_guardian";

      const athleteName =
        clean(token.prefill?.athleteName) ||
        clean(
          proposal.lockedSnapshot?.athletes?.[0]?.name ||
          proposal.athletes?.[0]?.name
        ) ||
        "your athlete";

      const url =
        intakeUrl(tokenId, intakeAudience);

      const audienceText =
        intakeAudience === "adult_athlete"
          ? "Adult Athlete"
          : "Parent / Guardian";

      const subject =
        `Continue Your Sandman Enrollment — ${athleteName}`;

      const text = [
        "Continue Your Sandman Enrollment",
        "",
        "Your enrollment payment is complete.",
        "",
        `Please continue the enrollment for ${athleteName} by completing and submitting the secure Sandman intake form below.`,
        "",
        `This intake is assigned to the ${audienceText} and the secure link is valid for 48 hours from creation.`,
        "",
        url,
        "",
        "Once the intake is submitted, Sandman Management will review it and complete athlete activation.",
        "",
        "Sandman Combat"
      ].join("\n");

      const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="padding:28px 14px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #2d2d2d;">
      <div style="background:#050505;padding:28px 26px;text-align:center;">
        <div style="color:#facc15;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Sandman Combat</div>
        <div style="margin-top:8px;color:#fff;font-size:26px;font-weight:850;">Continue Your Enrollment</div>
      </div>
      <div style="padding:30px 28px;">
        <p style="font-size:16px;line-height:1.7;color:#27272a;">
          Your enrollment payment is complete.
        </p>
        <p style="font-size:16px;line-height:1.7;color:#27272a;">
          Please continue the enrollment for <strong>${escapeHtml(athleteName)}</strong> by completing and submitting the secure Sandman intake form.
        </p>
        <p style="font-size:14px;line-height:1.6;color:#52525b;">
          This intake is assigned to the ${escapeHtml(audienceText)}. The secure link is valid for 48 hours from creation.
        </p>
        <div style="margin:28px 0;text-align:center;">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;background:#facc15;color:#050505;border-radius:10px;font-size:16px;font-weight:850;text-decoration:none;">
            Continue &amp; Submit Intake
          </a>
        </div>
        <p style="font-size:13px;line-height:1.6;color:#71717a;">
          Once the intake is submitted, Sandman Management will review it and complete athlete activation.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

      const resend =
        getResendClient();

      const result =
        await resend.emails.send({
          from:
            "Sandman Combat <join@sandmancombat.com>",
          replyTo:
            "joinsandmancombat@gmail.com",
          to: recipient,
          subject,
          text,
          html
        });

      if (result.error) {
        throw new functions.https.HttpsError(
          "internal",
          result.error.message ||
          "The email provider rejected the intake email."
        );
      }

      const resendEmailId =
        result.data?.id || "";

      await tokenRef.set(
        {
          deliveryStatus: "SENT",
          deliveredAt:
            FieldValue.serverTimestamp(),
          deliveredTo: recipient,
          deliveredByUid: context.auth.uid,
          resendEmailId,
          updatedAt:
            FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await db
        .doc(
          `proposals/${proposalId}/history/intake_email_${tokenId}`
        )
        .set(
          {
            proposalId,
            event: "INTAKE_INVITE_SENT",
            fromStatus: "PAID",
            toStatus: "PAID",
            createdBy: context.auth.uid,
            createdByName: "Management",
            intakeTokenId: tokenId,
            intakeAudience,
            recipient,
            resendEmailId,
            source: "management_enrollment_email",
            occurredAt:
              FieldValue.serverTimestamp(),
            createdAt:
              FieldValue.serverTimestamp()
          },
          { merge: true }
        );

      return {
        ok: true,
        recipient,
        tokenId,
        proposalId,
        intakeAudience,
        resendEmailId,
        url
      };
    });
