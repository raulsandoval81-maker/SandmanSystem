// functions/src/infra/logAdmin.ts
import * as admin from "firebase-admin";

// Initialize Admin exactly once (safe in emulator and prod)
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();

/** Month key "YYYYMM" for /adminLogs/{domain}/{YYYYMM}/... */
export const yyyymm = (d: Date = new Date()) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Append a single admin log entry.
 * - Domain buckets (e.g., "intake", "xp", "security")
 * - Monthly subcollection {YYYYMM}
 * - Writes *new* docs only (no updates)
 */
export async function logAdmin(
  domain: string,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const bucket = yyyymm();
  await db
    .collection("adminLogs")
    .doc(domain)                 // e.g., "intake"
    .collection(bucket)          // e.g., "202510"
    .add({
      action,                    // e.g., "approve_intake"
      ...payload,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/* -------------------------------------------------------
 * Convenience wrappers (strongly-typed payloads)
 * -----------------------------------------------------*/

export type ApproveLogPayload = {
  actorUid: string;
  intakeId: string;
  athleteUid: string;
  track: "F8" | "F4";
  padlock: string;
  status: "active" | "pending-exception";
  org?: { team?: string | null; city?: string | null; state?: string | null };
  exceptions?: { fastTrack?: boolean; dualProg?: boolean };
};

export async function logIntakeApprove(payload: ApproveLogPayload) {
  return logAdmin("intake", "approve_intake", payload);
}

export type InviteLogPayload = {
  actorUid?: string | null;     // may be null in emulator
  token: string;                 // 8-char token
  url: string;                   // full parent-intake URL
  expiresAt: number;             // ms epoch
};

export async function logIntakeInvite(payload: InviteLogPayload) {
  return logAdmin("intake", "create_invite", payload);
}

/* -------------------------------------------------------
 * More wrappers as you grow:
 *   - logXpAward(...)
 *   - logSecurityEvent(...)
 *   - logExceptionDecision(...)
 * -----------------------------------------------------*/
