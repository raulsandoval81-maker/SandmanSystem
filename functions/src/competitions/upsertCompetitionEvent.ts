import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { OPERATIONAL_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { competitionAuditRole, competitionEventId, normalizeCompetitionEvent } from "./competitionPolicy";

const db = getFirestore();

function timestamp(value: unknown): Timestamp | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) throw new HttpsError("invalid-argument", "Invalid competition date/time.");
  return Timestamp.fromDate(date);
}

export const upsertCompetitionEvent = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const owner = await requireActiveStaff(req.auth.uid, OPERATIONAL_STAFF_ROLES, "Active Coach, Management, or Admin access required.");
  const auditRole = competitionAuditRole(owner.role);
  let event;
  try { event = normalizeCompetitionEvent(req.data || {}); }
  catch (error) { throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid competition event."); }
  if (!/^[a-z0-9][a-z0-9-]{2,159}$/.test(event.eventId)) throw new HttpsError("invalid-argument", "Invalid eventId.");
  const ref = db.doc(`events/${event.eventId}`);
  let savedPublicationStatus = "draft";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.data() || {};
    if (!snap.exists && event.eventId !== competitionEventId(event.name, event.startDate)) {
      throw new HttpsError("invalid-argument", "New competition eventId must use the canonical name/date identity.");
    }
    if (snap.exists && existing.eventType && existing.eventType !== "competition") {
      throw new HttpsError("failed-precondition", "This eventId belongs to another event type.");
    }
    // Saving event details never publishes them. Existing publication state is
    // preserved; new records are always drafts until the explicit publish call.
    const publicationStatus = snap.exists ? String(existing.publicationStatus || "draft") : "draft";
    savedPublicationStatus = publicationStatus;
    tx.set(ref, {
      ...event,
      publicationStatus,
      publishedAt: existing.publishedAt || null,
      publishedBy: existing.publishedBy || null,
      publishedByRole: existing.publishedByRole || null,
      startAt: event.timePrecision === "datetime" ? timestamp(event.startAt) : null,
      endAt: event.timePrecision === "datetime" ? timestamp(event.endAt) : null,
      createdBy: existing.createdBy || owner.uid,
      createdByRole: existing.createdByRole || auditRole,
      createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      updatedBy: owner.uid,
      updatedByRole: auditRole,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { ok: true, eventId: event.eventId, status: event.status, publicationStatus: savedPublicationStatus };
});
