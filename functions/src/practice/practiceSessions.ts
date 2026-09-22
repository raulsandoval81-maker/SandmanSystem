import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { COACH_STAFF_ROLES, normalizeStaffRole, requireActiveStaff } from "../services/staffAuthorization";
import { staffLocationIds } from "../schedules/crossTrainingPolicy";

const PRACTICE_STAFF_ROLES = COACH_STAFF_ROLES;
const EXECUTION_MODES = new Set(["manual", "hybrid", "quick", "checked-in"]);

function requiredString(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new HttpsError("invalid-argument", `${field} is required.`);
  return normalized;
}

function requirePracticeLocation(actor: Awaited<ReturnType<typeof requireActiveStaff>>, locationId: string) {
  if (["admin", "system_admin"].includes(actor.role)) return;
  if (!staffLocationIds(actor.staff).includes(locationId)) {
    throw new HttpsError("permission-denied", "Practice location is outside the staff member's authorized scope.");
  }
}

export const openPracticeSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(
    request.auth.uid,
    PRACTICE_STAFF_ROLES,
    "Active Coach or staff access required."
  );
  const input = request.data || {};
  const liveSessionId = requiredString(input.liveSessionId, "liveSessionId");
  const roomId = requiredString(input.roomId, "roomId");
  const locationId = requiredString(input.locationId || input.academyId, "locationId");
  requirePracticeLocation(actor, locationId);
  const discipline = requiredString(input.discipline, "discipline").toLowerCase();
  const requestedPracticeId = String(input.practiceId || "").trim();
  if (requestedPracticeId.includes("/")) throw new HttpsError("invalid-argument", "practiceId is invalid.");
  const executionModeInput = String(input.executionMode || "").trim().toLowerCase();
  if (executionModeInput && !EXECUTION_MODES.has(executionModeInput)) {
    throw new HttpsError("invalid-argument", "executionMode is invalid.");
  }
  const db = getFirestore();
  const practiceRef = requestedPracticeId
    ? db.doc(`practiceSessions/${requestedPracticeId}`)
    : db.collection("practiceSessions").doc();
  const now = FieldValue.serverTimestamp();
  let idempotent = false;

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(practiceRef);
    const current = existing.data() || {};
    if (requestedPracticeId && !existing.exists) {
      throw new HttpsError("not-found", "The supplied practiceId does not exist.");
    }
    if (existing.exists) {
      idempotent = true;
      requirePracticeLocation(actor, requiredString(current.locationId || current.academyId, "practice locationId"));
      if (normalizeStaffRole(actor.role) !== "admin" && String(current.coachUid || "") !== actor.uid) {
        throw new HttpsError("permission-denied", "Only the Coach who opened this practice may resume it.");
      }
      if (String(current.status || "").toLowerCase() !== "active") {
        throw new HttpsError("failed-precondition", "This practice is no longer active.");
      }
      if (String(current.locationId || current.academyId || "") !== locationId) {
        throw new HttpsError("failed-precondition", "Practice location cannot change while resuming.");
      }
      if (String(current.roomId || "") !== roomId) {
        throw new HttpsError("failed-precondition", "Practice room cannot change while resuming.");
      }
      if (String(current.liveSessionId || "") !== liveSessionId) {
        throw new HttpsError("failed-precondition", "Practice live-session identity cannot change while resuming.");
      }

      // Once athletes are checked in, the participation record owns the session
      // context. A resume may refresh planning details, but must not silently move
      // those athletes to a different discipline, journey, program, or focus tier.
      const attendanceSnap = await tx.get(db.doc(`attendance_sessions/${practiceRef.id}`));
      const attendance = attendanceSnap.data() || {};
      const hasParticipants = Number(attendance.checkedInCount || 0) > 0
        || (Array.isArray(attendance.checkedInIds) && attendance.checkedInIds.length > 0)
        || (Array.isArray(attendance.checkedIn) && attendance.checkedIn.length > 0);
      if (hasParticipants) {
        const stableContext = [
          ["discipline", String(current.discipline || "").toLowerCase(), discipline],
          ["journey", String(current.journey || ""), String(input.journey || "").trim()],
          ["program", String(current.program || ""), String(input.program || "").trim()],
          ["tier", String(current.tier || ""), String(input.tier || "").trim()],
        ];
        const changed = stableContext.find(([, before, after]) => before !== after);
        if (changed) {
          throw new HttpsError("failed-precondition", `Practice ${changed[0]} cannot change after check-in begins.`);
        }
      }
    }

    const executionMode = executionModeInput || String(current.executionMode || "").trim().toLowerCase();
    const practice = {
      practiceId: practiceRef.id,
      liveSessionId,
      locationId,
      academyId: locationId,
      roomId,
      coachUid: existing.exists ? String(current.coachUid || actor.uid) : actor.uid,
      coachRole: existing.exists ? String(current.coachRole || actor.role) : actor.role,
      status: "active",
      discipline,
      journey: String(input.journey || "").trim(),
      program: String(input.program || "").trim(),
      track: String(input.track || "").trim(),
      tier: String(input.tier || "").trim(),
      schema: String(input.schema || "").trim(),
      durationMinutes: Math.max(0, Number(input.durationMinutes || 0)),
      ...(executionMode ? { executionMode } : {}),
      ...(existing.exists ? {} : { openedAt: now }),
      updatedAt: now,
      source: "session-builder",
    };

    if (existing.exists) tx.set(practiceRef, practice, { merge: true });
    else tx.create(practiceRef, practice);
    tx.set(db.doc(`liveSessions/${liveSessionId}`), {
      practiceId: practiceRef.id,
      liveSessionId,
      locationId,
      academyId: locationId,
      roomId,
      coachUid: practice.coachUid,
      status: "ready",
      discipline,
      journey: practice.journey,
      ...(executionMode ? { executionMode } : {}),
      updatedAt: now,
    }, { merge: true });
  });

  return { ok: true, practiceId: practiceRef.id, liveSessionId, status: "active", idempotent };
});

export const getPracticeSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
  const practiceId = requiredString(request.data?.practiceId, "practiceId");
  const snap = await getFirestore().doc(`practiceSessions/${practiceId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Practice not found.");
  requirePracticeLocation(actor, requiredString(snap.data()?.locationId || snap.data()?.academyId, "practice locationId"));
  return { ok: true, practiceId: snap.id, practice: snap.data() || {} };
});

export const closePracticeSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
  const practiceId = requiredString(request.data?.practiceId, "practiceId");
  const attendanceSessionId = requiredString(request.data?.attendanceSessionId, "attendanceSessionId");
  const db = getFirestore();
  let idempotent = false;
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`practiceSessions/${practiceId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Practice not found.");
    const practice = snap.data() || {};
    requirePracticeLocation(actor, requiredString(practice.locationId || practice.academyId, "practice locationId"));
    const liveSessionId = String(practice.liveSessionId || "").trim();
    const liveRef = liveSessionId ? db.doc(`liveSessions/${liveSessionId}`) : null;
    const liveSnap = liveRef ? await tx.get(liveRef) : null;
    if (String(practice.status || "").toLowerCase() === "closed") {
      idempotent = true;
      return;
    }
    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      status: "closed",
      attendanceSessionId,
      closedAt: now,
      closedBy: actor.uid,
      closedByRole: actor.role,
      updatedAt: now,
    });
    if (liveRef && String(liveSnap?.data()?.practiceId || "") === practiceId) {
      tx.set(liveRef, {
        practiceId,
        status: "closed",
        closedAt: now,
        updatedAt: now,
      }, { merge: true });
    }
  });
  return { ok: true, practiceId, status: "closed", idempotent };
});
