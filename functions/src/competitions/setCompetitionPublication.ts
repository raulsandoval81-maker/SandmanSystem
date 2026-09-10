import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { OPERATIONAL_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { competitionAuditRole } from "./competitionPolicy";

const db = getFirestore();

export const setCompetitionPublication = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const actor = await requireActiveStaff(req.auth.uid, OPERATIONAL_STAFF_ROLES, "Active Coach, Management, or Admin access required.");
  const auditRole = competitionAuditRole(actor.role);
  const eventId = String(req.data?.eventId || "").trim();
  const seasonYear = Number(req.data?.seasonYear);
  const programScope = String(req.data?.programScope || "").trim().toLowerCase();
  const publicationStatus = String(req.data?.publicationStatus || "").trim().toLowerCase();
  const singleEvent = /^[a-z0-9][a-z0-9-]{2,159}$/.test(eventId);
  if (!singleEvent && (!Number.isInteger(seasonYear) || !programScope)) throw new HttpsError("invalid-argument", "eventId or seasonYear/programScope required.");
  if (!['draft', 'published'].includes(publicationStatus)) throw new HttpsError("invalid-argument", "publicationStatus must be draft or published.");
  const snapshots = singleEvent
    ? [await db.doc(`events/${eventId}`).get()]
    : (await db.collection("events").where("eventType", "==", "competition").get()).docs.filter((doc) => {
      const data = doc.data();
      return Number(data.seasonYear) === seasonYear && Array.isArray(data.programScopes) && data.programScopes.includes(programScope) && data.status === "active";
    });
  if (!snapshots.length || snapshots.some((snap) => !snap.exists || snap.data()?.eventType !== "competition")) throw new HttpsError("not-found", "Competition schedule not found.");
  if (snapshots.length > 450) throw new HttpsError("resource-exhausted", "Competition schedule is too large for one publication action.");
  const batch = db.batch();
  for (const snap of snapshots) batch.update(snap.ref, {
      publicationStatus,
      publishedAt: publicationStatus === "published" ? FieldValue.serverTimestamp() : null,
      publishedBy: publicationStatus === "published" ? actor.uid : null,
      publishedByRole: publicationStatus === "published" ? auditRole : null,
      updatedBy: actor.uid,
      updatedByRole: auditRole,
      updatedAt: FieldValue.serverTimestamp(),
    });
  await batch.commit();
  return { ok: true, eventId: singleEvent ? eventId : null, seasonYear: singleEvent ? null : seasonYear, programScope: singleEvent ? null : programScope, publicationStatus, updatedCount: snapshots.length };
});
