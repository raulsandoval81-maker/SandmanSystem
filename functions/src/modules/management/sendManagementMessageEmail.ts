import * as functions from "firebase-functions";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  getResendClient,
} from "../email/resend";

import {
  MANAGEMENT_STAFF_ROLES,
  normalizeStaffRole,
  requireActiveStaff,
  requireStaffLocation,
} from "../../services/staffAuthorization";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown): string {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayTopic(value: unknown): string {
  const topic = clean(value);

  const labels: Record<string, string> = {
    programs: "Programs",
    schedule: "Schedule",
    admissions: "Admissions",
    pricing: "Pricing / Fees",
    billing: "Billing",
    coaching: "Coaching / Staff Development",
    partnership: "Community / Partnership",
    location: "Location",
    "request-pass": "Paid Day Pass",
    other: "General Question",
  };

  return labels[topic] || "General Question";
}

function displayPass(value: unknown): string {
  const passType = clean(value);

  const aliases: Record<string, string> = {
    combat_dropin_1day: "combat-dropin-1day",
    combat_dropin_2day: "combat-dropin-2day",
    fitness_dropin: "fitness-dropin",
  };

  const normalized =
    aliases[passType] || passType;

  const labels: Record<string, string> = {
    "combat-dropin-1day": "Combat — 1 Day Pass — $25",
    "combat-dropin-2day": "Combat — 2 Day Pass — $40",
    "fitness-dropin": "Fitness — 1 Day Drop-In — $15",
  };

  return labels[normalized] || "";
}

function buildEmail(input: {
  responseText: string;
  contactName: string;
  locationName: string;
  topic: string;
  passType: string;
  senderName: string;
}) {
  const {
    responseText,
    contactName,
    locationName,
    topic,
    passType,
    senderName,
  } = input;

  const subject = "A response from Sandman Academy";

  const safeResponse =
    escapeHtml(responseText).replace(/\n/g, "<br>");

  const safeContact =
    escapeHtml(contactName || "there");

  const safeLocation =
    escapeHtml(locationName);

  const safeTopic =
    escapeHtml(displayTopic(topic));

  const passLabel =
    displayPass(passType);

  const safePass =
    escapeHtml(passLabel);

  const safeSender =
    escapeHtml(senderName || "Sandman Management");

  const contextRows = [
    `<div style="margin-bottom:6px;"><strong>Topic:</strong> ${safeTopic}</div>`,
    safeLocation
      ? `<div style="margin-bottom:6px;"><strong>Location:</strong> ${safeLocation}</div>`
      : "",
    safePass
      ? `<div><strong>Pass:</strong> ${safePass}</div>`
      : "",
  ].filter(Boolean).join("");

  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#111111;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="padding:28px 14px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #2d2d2d;">
      <div style="background:#050505;padding:28px 26px;text-align:center;">
        <div style="color:#facc15;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">
          Sandman Academy
        </div>

        <div style="margin-top:8px;color:#ffffff;font-size:25px;font-weight:800;">
          Response to Your Message
        </div>

        <div style="margin-top:8px;color:#a1a1aa;font-size:14px;">
          Combat • Strength • Honor
        </div>
      </div>

      <div style="padding:30px 28px;">
        <div style="font-size:17px;font-weight:700;margin-bottom:18px;">
          Hi ${safeContact},
        </div>

        <div style="font-size:16px;line-height:1.7;color:#27272a;">
          ${safeResponse}
        </div>

        <div style="margin-top:28px;padding:16px 18px;background:#fafafa;border-left:4px solid #facc15;font-size:13px;line-height:1.6;color:#52525b;">
          ${contextRows}
        </div>

        <div style="margin-top:28px;font-size:15px;line-height:1.6;">
          <strong>${safeSender}</strong><br>
          Sandman Academy of Combat &amp; Fitness™
        </div>
      </div>

      <div style="padding:22px 24px;text-align:center;background:#050505;border-top:1px solid #2d2d2d;">
        <div style="color:#facc15;font-size:14px;font-weight:800;">
          The coach teaches. The athlete earns. The system remembers.
        </div>

        <div style="margin-top:8px;color:#71717a;font-size:12px;">
          Sandman Combat
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

  const text = [
    `Hi ${contactName || "there"},`,
    "",
    responseText,
    "",
    `Topic: ${displayTopic(topic)}`,
    locationName ? `Location: ${locationName}` : "",
    passLabel ? `Pass: ${passLabel}` : "",
    "",
    senderName || "Sandman Management",
    "Sandman Academy of Combat & Fitness™",
  ].filter(Boolean).join("\n");

  return {
    subject,
    html,
    text,
  };
}

export const sendManagementMessageEmail =
  functions.https.onCall(
    async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Management sign-in is required."
        );
      }

      const messageId =
        clean(data?.messageId);

      const responseText =
        clean(data?.responseText);

      if (!messageId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Message ID is required."
        );
      }

      if (!responseText) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Write a response before sending."
        );
      }

      const db =
        getFirestore();

      const uid =
        context.auth.uid;

      const actor =
        await requireActiveStaff(
          uid,
          MANAGEMENT_STAFF_ROLES,
          "Active Management access is required."
        );

      const staff: Record<string, unknown> =
        actor.staff;

      const role =
        normalizeStaffRole(actor.role);

      const adminRoles =
        ["admin"];

      const messageRef =
        db.collection("general_messages").doc(messageId);

      const messageSnapshot =
        await messageRef.get();

      if (!messageSnapshot.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Message not found."
        );
      }

      const message =
        messageSnapshot.data() || {};

      const locationId =
        requireStaffLocation(
          actor,
          message.locationId,
          "This message is outside your Management location scope."
        );

      const recipient =
        clean(message.email).toLowerCase();

      if (!recipient) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This message does not have an email address."
        );
      }

      const senderName =
        clean(
          staff["fullName"] ||
          staff["displayName"] ||
          context.auth.token.name ||
          "Sandman Management"
        );

      const email =
        buildEmail({
          responseText,
          contactName:
            clean(message.contactName),
          locationName:
            clean(
              message.locationName ||
              message.locationId
            ),
          topic:
            clean(message.topic),
          passType:
            clean(message.passType),
          senderName,
        });

      const resend =
        getResendClient();

      const result =
        await resend.emails.send({
          from:
            "Sandman Combat <join@sandmancombat.com>",

          replyTo:
            "joinsandmancombat@gmail.com",

          to:
            recipient,

          subject:
            email.subject,

          text:
            email.text,

          html:
            email.html,
        });

      if (result.error) {
        throw new functions.https.HttpsError(
          "internal",
          result.error.message ||
          "The email provider rejected the message."
        );
      }

      const resendEmailId =
        result.data?.id || "";

      const responseRef =
        messageRef.collection("responses").doc();

      const batch =
        db.batch();

      batch.set(
        responseRef,
        {
          channel: "email",
          to: recipient,
          subject: email.subject,
          body: responseText,
          resendEmailId,
          sentByUid: uid,
          sentByRole:
            adminRoles.includes(role)
              ? "SYSTEM_ADMIN"
              : "MANAGEMENT",
          sentByName: senderName,
          sentAt:
            FieldValue.serverTimestamp(),
        }
      );

      batch.update(
        messageRef,
        {
          assignedManagerUid: uid,

          status: "RESPONDED",
          messageStatus: "RESPONDED",

          respondedByUid: uid,

          respondedByRole:
            adminRoles.includes(role)
              ? "SYSTEM_ADMIN"
              : "MANAGEMENT",

          respondedAt:
            FieldValue.serverTimestamp(),

          routingStage:
            "MANAGEMENT_RESPONDED",

          assignmentStatus:
            "ASSIGNED",

          responseEmail:
            recipient,

          responseSubject:
            email.subject,

          responseBody:
            responseText,

          responseDeliveryStatus:
            "SENT",

          resendEmailId,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      await batch.commit();

      return {
        ok: true,
        emailId: resendEmailId,
        recipient,
        status: "RESPONDED",
      };
    }
  );
