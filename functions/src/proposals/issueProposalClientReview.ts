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
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";

import {
  buildClientProposalSnapshot,
  cleanReviewString,
  createProposalReviewToken,
  hashProposalReviewToken,
} from "./proposalClientReview";

import { resolveBillingPublicBaseUrl } from "./billingPublicBaseUrl";
import { clientReviewRecoveryGate } from "./clientReviewDeliveryRecovery";

import {
  getResendClient,
  RESEND_API_KEY,
} from "../modules/email/resend";

function escapeHtml(value: unknown): string {
  return cleanReviewString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildReviewEmail(input: {
  contactName: string;
  reviewUrl: string;
  membershipChoice?: boolean;
}) {
  const contactName =
    input.contactName || "there";

  const safeContactName =
    escapeHtml(contactName);

  const safeReviewUrl =
    escapeHtml(input.reviewUrl);

  const subject =
    input.membershipChoice
      ? "Choose your Sandman Academy membership option"
      : "Review your Sandman Academy membership proposal";

  const text = [
    `Hi ${contactName},`,
    "",
    input.membershipChoice
      ? "Your Sandman Academy membership options are ready."
      : "Your Sandman Academy membership proposal is ready for final review.",
    "",
    input.membershipChoice
      ? "Please open the secure Sandman link and choose the membership option you want. Management will update the proposal to match your choice, then send the final Review & Confirm step."
      : "Please review the membership details, payment schedule, and start information. If everything looks correct, accept the proposal to continue to Review & Confirm before secure payment.",
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
          ${input.membershipChoice
            ? "Your Sandman Academy membership options are ready. Please choose the option you want. Management will update the proposal to match your choice and then send the final Review & Confirm step."
            : "Your Sandman Academy membership proposal is ready for final review. Please review the membership details, payment schedule, and start information. If everything looks correct, accept the proposal to continue to Review & Confirm before secure payment."
          }
        </div>

        <div style="margin:26px 0;text-align:center;">
          <a href="${safeReviewUrl}" style="display:inline-block;background:#171717;color:#fff8e8;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px;">
            ${input.membershipChoice
              ? "Choose Membership Option"
              : "Review &amp; Accept Proposal"
            }
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

export const issueProposalClientReview =
  onCall(
    {
      secrets: [RESEND_API_KEY],
    },
    async (req) => {
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "You must be signed in to issue a client proposal review."
        );
      }

      const staffAccess =
        await requireProposalStaffAccess(
          req.auth.uid
        );

      const proposalId =
        cleanReviewString(
          req.data?.proposalId
        );

      const delivery =
        cleanReviewString(
          req.data?.delivery
        ).toLowerCase();

      const sendEmail =
        delivery === "email";

      // This recovery requires deliberate Management reconciliation. A lost
      // provider response is never proof that the email was not accepted.
      const recovery = req.data?.deliveryRecovery;
      const recoveryEvidence = cleanReviewString(recovery?.evidence);
      const recoveryAcknowledged = recovery?.acknowledgeRevocation === true;
      const providerChecked = recovery?.providerChecked === true;
      const recoveryIssuedAtMs = Number(recovery?.expectedIssuedAtMs);
      if (recovery !== undefined &&
          (!sendEmail || !providerChecked || !recoveryAcknowledged ||
           recoveryEvidence.length < 30 || recoveryEvidence.length > 1000 ||
           !Number.isSafeInteger(recoveryIssuedAtMs) || recoveryIssuedAtMs <= 0)) {
        throw new HttpsError("invalid-argument",
          "Remote recovery requires a provider check, a detailed reason, the original issuance timestamp, and acknowledgement of link revocation.");
      }

      if (!proposalId) {
        throw new HttpsError(
          "invalid-argument",
          "proposalId is required."
        );
      }

      if (
        delivery &&
        delivery !== "email"
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Unsupported client review delivery method."
        );
      }

      // Resolve before mutating proposal state or issuing a review token.
      const reviewBaseUrl =
        sendEmail ? resolveBillingPublicBaseUrl() : "";

      const db =
        getFirestore();

      const proposalRef =
        db.collection("proposals")
          .doc(proposalId);

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

      const result =
        await db.runTransaction(
          async (tx) => {
            const snap =
              await tx.get(
                proposalRef
              );

            if (!snap.exists) {
              throw new HttpsError(
                "not-found",
                `Proposal ${proposalId} was not found.`
              );
            }

            const proposal =
              snap.data() || {};

            requireProposalLocationAccess(
              staffAccess,
              proposal.locationId
            );

            const status =
              cleanReviewString(
                proposal.status
              );

            if (
              status !== "REVIEW" &&
              status !==
                "AWAITING_CLIENT_SIGNATURE"
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Only REVIEW proposals may be sent to the client."
              );
            }

            // Concurrent clicks cannot rotate the token during an active send.
            // A lost provider response remains explicitly uncertain.
            const previousReview = proposal.clientReview || {};
            const previousIssuedAt = previousReview.issuedAt;
            const gate = clientReviewRecoveryGate({
              deliveryStatus: cleanReviewString(previousReview.deliveryStatus),
              issuedAtMs: previousIssuedAt instanceof Timestamp
                ? previousIssuedAt.toMillis() : null,
              recoveryExpectedIssuedAtMs: recovery ? recoveryIssuedAtMs : null,
              hasRecovery: recovery !== undefined,
              nowMs: Date.now(),
            });
            if (!gate.allowed) {
              throw new HttpsError("failed-precondition",
                gate.reason || "Review delivery cannot be reissued yet.");
            }
            const unresolvedDelivery = gate.unresolved;

            const prospect =
              proposal.prospect &&
              typeof proposal.prospect === "object"
                ? proposal.prospect as Record<string, unknown>
                : {};

            const appointmentId =
              cleanReviewString(
                prospect.appointmentId
              );

            let recipient =
              cleanReviewString(
                prospect.email
              ).toLowerCase();

            let recipientSource =
              "proposal";

            if (appointmentId) {
              const appointmentRef =
                db.collection(
                  "admissions_appointments"
                ).doc(appointmentId);

              const appointmentSnap =
                await tx.get(
                  appointmentRef
                );

              if (!appointmentSnap.exists) {
                throw new HttpsError(
                  "failed-precondition",
                  "The appointment connected to this proposal could not be found."
                );
              }

              const appointmentEmail =
                cleanReviewString(
                  appointmentSnap.get("email")
                ).toLowerCase();

              if (appointmentEmail) {
                recipient =
                  appointmentEmail;

                recipientSource =
                  "appointment";
              }
            }

            if (
              sendEmail &&
              !recipient
            ) {
              throw new HttpsError(
                "failed-precondition",
                "This proposal does not have a client email address."
              );
            }

            const contactName =
              cleanReviewString(
                prospect.primaryContactName ||
                prospect.familyName
              );

            const proposalForSnapshot = {
              ...proposal,
              prospect: {
                ...prospect,
                email: recipient,
              },
            };

            const existingSnapshot =
              proposal.clientReview?.snapshot;

            // Do not reuse an older review snapshot that predates cash
            // disclosure. Management must revoke it via Return to Draft.
            if (
              existingSnapshot &&
              Array.isArray(proposal.priorPayments) &&
              proposal.priorPayments.length > 0 &&
              (!existingSnapshot.historicalCash ||
               !existingSnapshot.historicalCashCheckoutTerms)
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Existing client-review snapshot predates historical cash disclosure. Return to Draft and issue a new review."
              );
            }

            const clientSnapshot =
              existingSnapshot ||
              buildClientProposalSnapshot(
                proposalId,
                proposalForSnapshot
              );

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            tx.update(
              proposalRef,
              {
                status:
                  "AWAITING_CLIENT_SIGNATURE",

                "prospect.email":
                  recipient || null,

                "prospect.emailSource":
                  recipientSource,

                clientReview: {
                  tokenHash,
                  expiresAt,
                  snapshotVersion: 1,
                  snapshot:
                    clientSnapshot,

                  issuedBy:
                    req.auth!.uid,

                  issuedAt:
                    FieldValue.serverTimestamp(),
                  deliveryStatus: sendEmail ? "sending" : "local",
                  deliveryAttemptedAt: sendEmail ? FieldValue.serverTimestamp() : null,
                },

                updatedBy:
                  req.auth!.uid,

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );

            if (unresolvedDelivery) {
              tx.create(proposalRef.collection("history").doc(), {
                proposalId,
                event: "CLIENT_REVIEW_DELIVERY_RECOVERY_REISSUED",
                previousDeliveryStatus: previousReview.deliveryStatus,
                previousIssuedAt,
                previousTokenRevoked: true,
                providerChecked: true,
                evidence: recoveryEvidence,
                createdBy: req.auth!.uid,
                createdAt: FieldValue.serverTimestamp(),
              });
            }

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  "CLIENT_REVIEW_ISSUED",

                fromStatus:
                  status,

                toStatus:
                  "AWAITING_CLIENT_SIGNATURE",

                delivery:
                  sendEmail
                    ? "email"
                    : "local",

                recipient:
                  sendEmail
                    ? recipient
                    : null,

                recipientSource,

                createdBy:
                  req.auth!.uid,

                createdAt:
                  FieldValue.serverTimestamp(),
              }
            );

            return {
              status:
                "AWAITING_CLIENT_SIGNATURE",
              recipient,
              recipientSource,
              contactName,
            };
          }
        );

      const reviewPath =
        "/connect/proposals/review/" +
        `?proposalId=${encodeURIComponent(
          proposalId
        )}` +
        `&token=${encodeURIComponent(
          rawToken
        )}`;

      // Every provider response must match the still-active issued token.
      // An older asynchronous send cannot mark a newer review as delivered.
      async function recordDeliveryState(
        status: "unknown" | "rejected" | "provider_accepted",
        detail?: string,
        providerId?: string
      ): Promise<boolean> {
        return db.runTransaction(async (tx) => {
          const current = await tx.get(proposalRef);
          const review = current.data()?.clientReview || {};
          if (cleanReviewString(review.tokenHash) !== tokenHash ||
              cleanReviewString(current.data()?.status) !== "AWAITING_CLIENT_SIGNATURE") {
            return false;
          }
          tx.update(proposalRef, {
            "clientReview.deliveryStatus": status,
            "clientReview.deliveryError": detail || null,
            ...(status === "provider_accepted" ? {
              "clientReview.emailSentAt": FieldValue.serverTimestamp(),
              "clientReview.emailRecipient": result.recipient,
              "clientReview.emailRecipientSource": result.recipientSource,
              "clientReview.emailProviderId": providerId || null,
            } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (status === "provider_accepted") {
            tx.create(proposalRef.collection("history").doc(), {
              proposalId,
              event: "CLIENT_REVIEW_EMAIL_ACCEPTED_BY_PROVIDER",
              to: result.recipient,
              recipientSource: result.recipientSource,
              emailProviderId: providerId || null,
              createdBy: req.auth!.uid,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
          return true;
        });
      }

      let emailId = "";

      if (sendEmail) {
        const reviewUrl =
          `${reviewBaseUrl}${reviewPath}`;

        const email =
          buildReviewEmail({
            contactName:
              result.contactName,
            reviewUrl,
          });

        const resend =
          getResendClient();

        let emailResult;
        try {
          emailResult = await resend.emails.send({
            from: "Sandman Combat <join@sandmancombat.com>",
            replyTo: "joinsandmancombat@gmail.com",
            to: result.recipient,
            subject: email.subject,
            text: email.text,
            html: email.html,
          });
        } catch (_error) {
          // A timeout might mean delivered-to-provider. Do not claim failure.
          await recordDeliveryState("unknown", "Provider outcome could not be confirmed.");
          throw new HttpsError("unavailable",
            "Remote email outcome uncertain. Check the email provider before reissuing; a new link invalidates the old link.");
        }

        if (emailResult.error || !emailResult.data?.id) {
          await recordDeliveryState("rejected",
            emailResult.error?.message || "No accepted message ID returned.");
          throw new HttpsError("failed-precondition",
            emailResult.error?.message || "Email provider did not confirm acceptance.");
        }

        emailId =
          emailResult.data?.id || "";

        const stillCurrent = await recordDeliveryState(
          "provider_accepted", undefined, emailId
        );
        if (!stillCurrent) {
          throw new HttpsError("failed-precondition",
            "Review was superseded while the email provider processed it. Verify the current proposal; this older link is invalid.");
        }
      }

      return {
        ok: true,

        proposalId,

        ...result,

        delivery:
          sendEmail
            ? "email"
            : "local",

        recipient:
          sendEmail
            ? result.recipient
            : undefined,

        emailId:
          sendEmail
            ? emailId
            : undefined,

        reviewPath,

        expiresAt:
          expiresAt
            .toDate()
            .toISOString(),
      };
    }
  );
