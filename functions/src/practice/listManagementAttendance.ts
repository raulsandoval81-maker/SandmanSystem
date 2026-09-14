import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { staffLocationIds } from "../schedules/crossTrainingPolicy";

const clean = (value: unknown) => String(value ?? "").trim();

function millis(value: any): number {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function athlete(entry: any) {
  return {
    id: clean(entry?.id || entry?.uid),
    name: clean(entry?.name || entry?.publicName || entry?.fullName || entry?.id || entry?.uid),
    checkedInAt: entry?.checkedInAt || null,
  };
}

export const listManagementAttendance = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Management authentication required.");
  const actor = await requireActiveStaff(
    request.auth.uid,
    MANAGEMENT_STAFF_ROLES,
    "Active Management access required."
  );
  const isAdmin = actor.role === "admin" || actor.role === "system_admin";
  const allowedLocations = staffLocationIds(actor.staff);
  if (!isAdmin && !allowedLocations.length) {
    throw new HttpsError("permission-denied", "No authorized Management location is assigned.");
  }

  const db = getFirestore();
  const [practiceSnap, attendanceSnap] = await Promise.all([
    db.collection("practiceSessions").get(),
    db.collection("attendance_sessions").get(),
  ]);
  const practices = new Map(practiceSnap.docs.map((snap) => [snap.id, snap.data() || {}]));
  const ids = new Set([...practiceSnap.docs.map((snap) => snap.id), ...attendanceSnap.docs.map((snap) => snap.id)]);
  const attendance = new Map(attendanceSnap.docs.map((snap) => [snap.id, snap.data() || {}]));

  const sessions = [...ids].map((practiceId) => {
    const practice: any = practices.get(practiceId) || {};
    const record: any = attendance.get(practiceId) || {};
    const locationId = clean(practice.locationId || practice.academyId || record.locationId || record.academyId);
    if (!locationId || (!isAdmin && !allowedLocations.includes(locationId))) return null;
    const checkedIn = Array.isArray(record.checkedIn) ? record.checkedIn.map(athlete).filter((item: any) => item.id) : [];
    const present = Array.isArray(record.present) ? record.present.map(athlete).filter((item: any) => item.id) : [];
    const removedIds = Array.isArray(record.removedFromReviewIds) ? record.removedFromReviewIds.map(clean).filter(Boolean) : [];
    const status = clean(record.status || (practice.status === "active" ? "open" : practice.status || "open")).toLowerCase();
    return {
      practiceId,
      locationId,
      discipline: clean(practice.discipline || record.discipline),
      roomId: clean(practice.roomId || record.roomId),
      coach: clean(record.coach || practice.coachName || practice.coachUid),
      coachUid: clean(practice.coachUid || record.coachUid),
      openedAt: practice.openedAt || record.createdAt || null,
      submittedAt: record.submittedAt || null,
      finalizedAt: record.finalizedAt || null,
      status,
      practiceStatus: clean(practice.status),
      checkedInCount: Number(record.checkedInCount ?? checkedIn.length ?? 0),
      presentCount: Number(record.presentCount ?? present.length ?? 0),
      checkedIn,
      present,
      removedIds,
      updatedAt: record.updatedAt || practice.updatedAt || null,
      sortAt: Math.max(millis(record.finalizedAt), millis(record.submittedAt), millis(record.updatedAt), millis(practice.openedAt)),
    };
  }).filter(Boolean).sort((a: any, b: any) => b.sortAt - a.sortAt).slice(0, 100);

  return { ok: true, locationIds: isAdmin ? [] : allowedLocations, sessions };
});
