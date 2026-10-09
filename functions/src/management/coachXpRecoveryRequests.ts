import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  COACH_STAFF_ROLES, MANAGEMENT_STAFF_ROLES,
  requireActiveStaff, requireStaffLocation, requireCoachAthleteAccess
} from "../services/staffAuthorization";

const db = getFirestore();
const clean = (v: unknown) => String(v ?? "").trim();

export const submitCoachXpRecoveryRequest = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Coach sign-in required.");
  const actor = await requireActiveStaff(request.auth.uid, COACH_STAFF_ROLES);
  const locationId = requireStaffLocation(actor, request.data?.locationId);
  const raw = request.data?.entries;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) {
    throw new HttpsError("invalid-argument", "Provide 1–50 missing practice entries.");
  }
  const entries = raw.map((row: any) => ({
    athleteId: clean(row?.athleteId),
    practiceDate: clean(row?.practiceDate),
    requestedXp: Number(row?.requestedXp),
    note: clean(row?.note).slice(0, 300)
  }));
  const unique = new Set<string>();
  for (const entry of entries) {
    if (!/^[A-Za-z0-9_-]{2,100}$/.test(entry.athleteId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.practiceDate) ||
        !Number.isInteger(entry.requestedXp) || entry.requestedXp < 1 || entry.requestedXp > 15 ||
        !Number.isFinite(Date.parse(entry.practiceDate + "T00:00:00Z")) ||
        new Date(entry.practiceDate + "T00:00:00Z").toISOString().slice(0, 10) !== entry.practiceDate ||
        entry.practiceDate > new Date().toISOString().slice(0, 10)) {
      throw new HttpsError("invalid-argument", "Each row needs a valid athlete ID, past practice date, and 1–15 requested XP.");
    }
    const key = entry.athleteId + "|" + entry.practiceDate;
    if (unique.has(key)) throw new HttpsError("invalid-argument", "Duplicate athlete/date in report: " + key);
    unique.add(key);
    const snap = await db.doc("athletes/" + entry.athleteId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Athlete not found: " + entry.athleteId);
    const athlete = snap.data() || {};
    requireCoachAthleteAccess(actor, athlete);
    if (clean(athlete.locationId) !== locationId) {
      throw new HttpsError("permission-denied", "Athlete and report locations do not match.");
    }
  }
  const note = clean(request.data?.note).slice(0, 1500);
  const ref = db.collection("coachXpRecoveryRequests").doc();
  await ref.create({
    requestId: ref.id, coachUid: actor.uid, locationId,
    entries, note, status: "PENDING_MANAGEMENT",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  return { ok: true, requestId: ref.id, status: "PENDING_MANAGEMENT", entries: entries.length };
});

export const listCoachXpRecoveryRequests = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Staff sign-in required.");
  const isCoach = clean(request.data?.view) === "coach";
  const actor = await requireActiveStaff(request.auth.uid,
    isCoach ? COACH_STAFF_ROLES : MANAGEMENT_STAFF_ROLES);
  const snapshot = await db.collection("coachXpRecoveryRequests").orderBy("createdAt", "desc").limit(100).get();
  const allowed = snapshot.docs.map(d => ({ ...d.data(), requestId: d.id }))
    .filter((r: any) => isCoach ? r.coachUid === actor.uid :
      actor.role === "admin" || (actor.scope?.locationIds || []).includes(r.locationId));
  return { requests: allowed.map((r: any) => ({
    ...r, createdAt: r.createdAt?.toMillis?.() || null,
    updatedAt: r.updatedAt?.toMillis?.() || null
  })) };
});

export const reviewCoachXpRecoveryRequest = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Management sign-in required.");
  const actor = await requireActiveStaff(request.auth.uid, MANAGEMENT_STAFF_ROLES);
  const requestId = clean(request.data?.requestId);
  const decision = clean(request.data?.decision).toUpperCase();
  const note = clean(request.data?.note);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(requestId) ||
      !["REVIEWED", "REJECTED"].includes(decision) || note.length < 8 || note.length > 1500) {
    throw new HttpsError("invalid-argument", "Provide a request, decision, and review note (8–1500 characters).");
  }
  const ref = db.collection("coachXpRecoveryRequests").doc(requestId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Request not found.");
    const record = snap.data() || {};
    requireStaffLocation(actor, record.locationId);
    if (record.status !== "PENDING_MANAGEMENT") {
      throw new HttpsError("failed-precondition", "This request was already reviewed.");
    }
    tx.update(ref, {
      status: decision, managementNote: note, reviewedBy: actor.uid,
      reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      xpAwardedByThisRequest: 0
    });
  });
  return { ok: true, status: decision, xpAwardedByThisRequest: 0 };
});
