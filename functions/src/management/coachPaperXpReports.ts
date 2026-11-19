import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { COACH_STAFF_ROLES, MANAGEMENT_STAFF_ROLES, requireActiveStaff, requireStaffLocation } from "../services/staffAuthorization";

const db = getFirestore();
const clean = (v: unknown) => String(v ?? "").trim();

export const submitCoachPaperXpReport = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Coach sign-in required.");
  const actor = await requireActiveStaff(request.auth.uid, COACH_STAFF_ROLES);
  const locationId = requireStaffLocation(actor, request.data?.locationId);
  const raw = request.data?.athletes;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) {
    throw new HttpsError("invalid-argument", "Provide 1–50 athletes.");
  }
  const athletes = raw.map((row: any) => ({
    name: clean(row?.name), athleteId: clean(row?.athleteId),
    paperXp: Number(row?.paperXp), evidence: clean(row?.evidence)
  }));
  const seen = new Set<string>();
  for (const a of athletes) {
    if (a.name.length < 2 || a.name.length > 120 ||
      (a.athleteId && !/^[A-Za-z0-9_-]{2,100}$/.test(a.athleteId)) ||
      !Number.isSafeInteger(a.paperXp) || a.paperXp < 1 || a.paperXp > 10000 ||
      a.evidence.length > 500) {
      throw new HttpsError("invalid-argument", "Each athlete needs a name and valid positive paper XP.");
    }
    const key = (a.athleteId || a.name).toLowerCase();
    if (seen.has(key)) throw new HttpsError("invalid-argument", "Duplicate athlete: " + key);
    seen.add(key);
  }
  const note = clean(request.data?.note);
  if (note.length < 8 || note.length > 1500) {
    throw new HttpsError("invalid-argument", "Coach explanation must be 8–1500 characters.");
  }
  const ref = db.collection("coachPaperXpReports").doc();
  await ref.create({
    reportId: ref.id, coachUid: actor.uid, locationId, note, athletes,
    status: "PENDING_MANAGEMENT", managementNote: "",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    xpAwardedByReport: 0
  });
  return { ok: true, reportId: ref.id, athletes: athletes.length, xpAwardedByReport: 0 };
});

export const listCoachPaperXpReports = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Staff sign-in required.");
  const isCoach = clean(request.data?.view) === "coach";
  const actor = await requireActiveStaff(request.auth.uid,
    isCoach ? COACH_STAFF_ROLES : MANAGEMENT_STAFF_ROLES);
  const snapshot = await db.collection("coachPaperXpReports").orderBy("createdAt", "desc").limit(100).get();
  const records = snapshot.docs.map(d => ({ ...d.data(), reportId: d.id }))
    .filter((r: any) => isCoach ? r.coachUid === actor.uid :
      actor.role === "admin" || (actor.scope?.locationIds || []).includes(r.locationId));
  return { reports: records.map((r: any) => ({
    ...r, createdAt: r.createdAt?.toMillis?.() || null,
    updatedAt: r.updatedAt?.toMillis?.() || null
  })) };
});

export const reviewCoachPaperXpReport = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Management sign-in required.");
  const actor = await requireActiveStaff(request.auth.uid, MANAGEMENT_STAFF_ROLES);
  const reportId = clean(request.data?.reportId);
  const decision = clean(request.data?.decision).toUpperCase();
  const note = clean(request.data?.note);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(reportId) ||
      !["REVIEWED", "REJECTED"].includes(decision) || note.length < 8 || note.length > 1500) {
    throw new HttpsError("invalid-argument", "Provide report, decision, and Management note (8–1500 characters).");
  }
  const ref = db.collection("coachPaperXpReports").doc(reportId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Report not found.");
    const record = snap.data() || {};
    requireStaffLocation(actor, record.locationId);
    if (record.status !== "PENDING_MANAGEMENT") {
      throw new HttpsError("failed-precondition", "Report already reviewed.");
    }
    tx.update(ref, {
      status: decision, managementNote: note, reviewedBy: actor.uid,
      reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      xpAwardedByReport: 0
    });
  });
  return { ok: true, status: decision, xpAwardedByReport: 0 };
});
