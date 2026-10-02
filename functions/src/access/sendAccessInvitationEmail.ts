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

function accessUrl(input: {
  role: string;
  athleteUid: string;
  tokenId: string;
  email: string;
}): string {
  const base = "https://sandmancombat.com/access/first-time/";
  const params = new URLSearchParams();
  params.set("role", input.role);
  if (input.role === "athlete") {
    params.set("id", input.athleteUid);
  }
  params.set("token", input.tokenId);
  params.set("email", input.email);
  return `${base}?${params.toString()}`;
}

function buildEmail(input: {
  role: "parent" | "athlete";
  athleteName: string;
  athleteUid: string;
  url: string;
}) {
  const isParent = input.role === "parent";
  const subject = isParent
    ? `Your Sandman Parent Access — ${input.athleteName || input.athleteUid}`
    : `Your Sandman Athlete Access — ${input.athleteName || input.athleteUid}`;

  const heading = isParent
    ? "Your Parent access is ready"
    : "Your Athlete access is ready";

  const intro = isParent
    ? `Sandman Management has approved your Parent access connected to ${input.athleteName || "your athlete"}.`
    : `Sandman Management has approved Athlete access for ${input.athleteName || "this athlete"}.`;

  const next = isParent
    ? "Use the secure button below once to activate your Parent account. You will then see a short Sandman orientation and continue to Parent Hub."
    : "Use the secure button below once to activate your Athlete account. You will then see a short Sandman orientation and continue to Athlete Hub.";

  const text = [
    heading,
    "",
    intro,
    "",
    next,
    "",
    input.url,
    "",
    "This is a one-time activation shortcut. After activation, Sandman will normally remember the signed-in session on that device. If sign-in is ever needed again, use the normal Sandman Login page.",
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
        <div style="margin-top:8px;color:#fff;font-size:26px;font-weight:850;">${escapeHtml(heading)}</div>
      </div>
      <div style="padding:30px 28px;">
        <p style="font-size:16px;line-height:1.7;color:#27272a;">${escapeHtml(intro)}</p>
        <p style="font-size:16px;line-height:1.7;color:#27272a;">${escapeHtml(next)}</p>
        <div style="margin:28px 0;text-align:center;">
          <a href="${escapeHtml(input.url)}" style="display:inline-block;padding:14px 22px;background:#facc15;color:#050505;border-radius:10px;font-size:16px;font-weight:850;text-decoration:none;">
            Activate ${isParent ? "Parent" : "Athlete"} Access
          </a>
        </div>
        <p style="font-size:13px;line-height:1.6;color:#71717a;">
          This is a one-time activation shortcut. After activation, Sandman will normally remember the signed-in session on that device. If sign-in is ever needed again, use the normal Sandman Login page.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  return { subject, text, html };
}

async function recordProposalHistory(input: {
  athleteUid: string;
  role: string;
  recipient: string;
  tokenId: string;
  resendEmailId: string;
  actorUid: string;
}) {
  const intakeSnap = await db
    .collection("intakes")
    .where("approvedUid", "==", input.athleteUid)
    .get();

  const approved = intakeSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
    .filter(({ data }) =>
      clean(data.status).toLowerCase() === "approved" &&
      Boolean(clean(data.proposalId))
    )
    .sort((a, b) => {
      const am = a.data.approvedAt?.toMillis?.() || 0;
      const bm = b.data.approvedAt?.toMillis?.() || 0;
      return bm - am;
    })[0];

  if (!approved) return;

  const proposalId = clean(approved.data.proposalId);
  const historyId =
    `access_${input.role}_sent_${input.tokenId.slice(0, 18)}`;

  await db
    .doc(`proposals/${proposalId}/history/${historyId}`)
    .set(
      {
        proposalId,
        event:
          input.role === "parent"
            ? "PARENT_ACCESS_SENT"
            : "ATHLETE_ACCESS_SENT",
        fromStatus: "PAID",
        toStatus: "PAID",
        createdBy: input.actorUid,
        createdByName: "Management",
        athleteUid: input.athleteUid,
        intakeId: approved.id,
        accessRole: input.role,
        recipient: input.recipient,
        accessInvitationId: input.tokenId,
        resendEmailId: input.resendEmailId,
        source: "management_access_setup",
        occurredAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
}

export const sendAccessInvitationEmail =
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
      const athleteUid = clean(data?.athleteUid).toUpperCase();
      const role = clean(data?.role).toLowerCase();
      const recipient = normalizeEmail(data?.email);

      if (
        !tokenId ||
        !athleteUid ||
        !recipient ||
        !["parent", "athlete"].includes(role)
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Valid access invitation details are required."
        );
      }

      const [athleteSnap, invitationSnap] = await Promise.all([
        db.doc(`athletes/${athleteUid}`).get(),
        db.doc(`accessInvitations/${tokenId}`).get()
      ]);

      if (!athleteSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Athlete not found."
        );
      }

      if (!invitationSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Access invitation not found."
        );
      }

      const athlete = athleteSnap.data() || {};
      const invitation = invitationSnap.data() || {};

      requireStaffLocation(
        actor,
        athlete.locationId,
        "This athlete is outside your Management location scope."
      );

      if (
        clean(invitation.athleteUid).toUpperCase() !== athleteUid ||
        clean(invitation.role).toLowerCase() !== role ||
        normalizeEmail(invitation.email) !== recipient
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Access invitation details do not match this athlete."
        );
      }

      if (invitation.used === true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This access invitation has already been used."
        );
      }

      const exp = Number(invitation.exp || 0);
      if (exp && exp < Date.now()) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "This access invitation has expired."
        );
      }

      const url = accessUrl({
        role,
        athleteUid,
        tokenId,
        email: recipient
      });

      const athleteName = clean(
        athlete.publicName ||
        athlete.fullName ||
        athlete.name ||
        athleteUid
      );

      const email = buildEmail({
        role: role as "parent" | "athlete",
        athleteName,
        athleteUid,
        url
      });

      const resend = getResendClient();
      const result = await resend.emails.send({
        from: "Sandman Combat <join@sandmancombat.com>",
        replyTo: "joinsandmancombat@gmail.com",
        to: recipient,
        subject: email.subject,
        text: email.text,
        html: email.html
      });

      if (result.error) {
        throw new functions.https.HttpsError(
          "internal",
          result.error.message ||
          "The email provider rejected the access email."
        );
      }

      const resendEmailId = result.data?.id || "";

      await invitationSnap.ref.set(
        {
          deliveryStatus: "SENT",
          deliveredAt: FieldValue.serverTimestamp(),
          deliveredTo: recipient,
          resendEmailId,
          deliveredByUid: context.auth.uid,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await recordProposalHistory({
        athleteUid,
        role,
        recipient,
        tokenId,
        resendEmailId,
        actorUid: context.auth.uid
      });

      return {
        ok: true,
        recipient,
        role,
        athleteUid,
        tokenId,
        resendEmailId,
        url
      };
    });
