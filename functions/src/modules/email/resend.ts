import { defineSecret } from "firebase-functions/params";
import { Resend } from "resend";

export const RESEND_API_KEY =
  defineSecret("RESEND_API_KEY");

export const STAGING_TEST_EMAIL_ALLOWLIST =
  defineSecret("STAGING_TEST_EMAIL_ALLOWLIST");

const STAGING_PROJECT = "sandman-combat-staging";

export type StagingRecipientDecision = {
  allowed: boolean;
  reason?: "ALLOWLIST_NOT_CONFIGURED" | "RECIPIENT_NOT_ALLOWED";
};

export function currentFirebaseProjectId(): string {
  const direct = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  if (direct) return direct;
  try {
    return String(JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || "").trim();
  } catch {
    return "";
  }
}

export function stagingRecipientDecision(
  recipient: string,
  projectId: string,
  configuredAllowlist: string
): StagingRecipientDecision {
  if (projectId !== STAGING_PROJECT) return { allowed: true };
  const allowed = new Set(
    configuredAllowlist.split(",").map(value => value.trim().toLowerCase()).filter(Boolean)
  );
  if (allowed.size === 0) return { allowed: false, reason: "ALLOWLIST_NOT_CONFIGURED" };
  if (!allowed.has(recipient.trim().toLowerCase())) {
    return { allowed: false, reason: "RECIPIENT_NOT_ALLOWED" };
  }
  return { allowed: true };
}

export function verifyStagingEmailRecipient(recipient: string): StagingRecipientDecision {
  const projectId = currentFirebaseProjectId();
  return stagingRecipientDecision(
    recipient,
    projectId,
    projectId === STAGING_PROJECT ? STAGING_TEST_EMAIL_ALLOWLIST.value() : ""
  );
}

export function getResendClient() {
  const key =
    RESEND_API_KEY.value();

  if (!key) {
    throw new Error("Missing RESEND_API_KEY secret");
  }

  return new Resend(key);
}
