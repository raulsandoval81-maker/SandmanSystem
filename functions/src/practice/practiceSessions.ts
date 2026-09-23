import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { COACH_STAFF_ROLES, normalizeStaffRole, requireActiveStaff } from "../services/staffAuthorization";
import { staffLocationIds } from "../schedules/crossTrainingPolicy";

const PRACTICE_STAFF_ROLES = COACH_STAFF_ROLES;
const EXECUTION_MODES = new Set(["manual", "hybrid", "quick", "checked-in"]);
const MEMORY_OPERATIONS = new Set(["plan", "worked", "reflection"]);

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

function compactString(value: unknown, max = 240): string {
  return String(value ?? "").trim().slice(0, max);
}

function compactCards(value: unknown, blockId = "") {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).map((item: any, index) => {
    const title = compactString(item?.title, 160);
    const href = compactString(item?.href, 500);
    const skillId = compactString(item?.skillId || item?.skill, 120);
    const familyId = compactString(item?.familyId || item?.family, 120);
    const cardId = compactString(item?.cardId || item?.id || href || skillId || familyId || title || `${blockId}-${index}`, 500);
    if (!cardId) throw new HttpsError("invalid-argument", "Every session-memory card requires an identity.");
    return { cardId, blockId: compactString(item?.blockId || blockId, 120), title, href, skillId, familyId };
  });
}

function compactBlocks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item: any, index) => {
    const blockId = compactString(item?.blockId || item?.id || item?.slot || `block-${index}`, 120);
    if (!blockId) throw new HttpsError("invalid-argument", "Every session-memory block requires an identity.");
    return {
      blockId,
      title: compactString(item?.title || item?.label || item?.slot, 160),
      minutes: Math.max(0, Math.min(240, Number(item?.minutes || 0))),
      cardIds: compactCards(item?.cards, blockId).map((card) => card.cardId),
    };
  });
}

function requirePracticeOwner(actor: Awaited<ReturnType<typeof requireActiveStaff>>, practice: Record<string, any>) {
  requirePracticeLocation(actor, requiredString(practice.locationId || practice.academyId, "practice locationId"));
  if (normalizeStaffRole(actor.role) !== "admin" && String(practice.coachUid || "") !== actor.uid) {
    throw new HttpsError("permission-denied", "Only the Coach who opened this practice may update its session memory.");
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

export const savePracticeSessionMemory = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(
    request.auth.uid,
    PRACTICE_STAFF_ROLES,
    "Active Coach or Admin access required."
  );
  const input = request.data || {};
  const practiceId = requiredString(input.practiceId, "practiceId");
  if (practiceId.includes("/")) throw new HttpsError("invalid-argument", "practiceId is invalid.");
  const operation = compactString(input.operation, 40).toLowerCase();
  if (!MEMORY_OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Unsupported session-memory operation.");
  }

  const db = getFirestore();
  const ref = db.doc(`practiceSessions/${practiceId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Practice not found.");
    const practice = snap.data() || {};
    requirePracticeOwner(actor, practice);
    const status = String(practice.status || "").toLowerCase();
    if (operation !== "reflection" && status !== "active") {
      throw new HttpsError("failed-precondition", "Closed practices cannot change plan or worked memory.");
    }
    if (operation === "reflection" && !["active", "closed"].includes(status)) {
      throw new HttpsError("failed-precondition", "Practice reflection cannot be saved in this state.");
    }

    const now = FieldValue.serverTimestamp();
    if (operation === "plan") {
      const plannedBlocks = compactBlocks(input.plannedBlocks);
      const plannedCards = compactCards(input.plannedCards);
      tx.update(ref, {
        "sessionMemory.planVersion": Math.max(1, Number(input.planVersion || 1)),
        "sessionMemory.plannedBlocks": plannedBlocks,
        "sessionMemory.plannedCards": plannedCards,
        "sessionMemory.planSavedAt": now,
        "sessionMemory.planSavedBy": actor.uid,
        updatedAt: now,
      });
      return;
    }

    if (operation === "worked") {
      const memory: any = practice.sessionMemory || {};
      const completedAt = Timestamp.now();
      const priorBlocks = Array.isArray(memory.workedBlocks) ? memory.workedBlocks : [];
      const priorCards = Array.isArray(memory.workedCards) ? memory.workedCards : [];
      const incomingBlocks = compactBlocks(input.workedBlocks);
      const incomingCards = compactCards(input.workedCards);
      const blockMap = new Map(priorBlocks.map((block: any) => [String(block.blockId || ""), block]));
      incomingBlocks.forEach((block) => blockMap.set(block.blockId, { ...block, completedAt }));
      const cardMap = new Map(priorCards.map((card: any) => [String(card.cardId || ""), card]));
      incomingCards.forEach((card) => cardMap.set(card.cardId, { ...card, completedAt }));
      const patch: Record<string, any> = {
        "sessionMemory.workedBlocks": [...blockMap.values()].slice(0, 20),
        "sessionMemory.workedCards": [...cardMap.values()].slice(0, 80),
        "sessionMemory.executionUpdatedAt": now,
        updatedAt: now,
      };
      if (input.executionStarted === true && !memory.executionStartedAt) {
        patch["sessionMemory.executionStartedAt"] = now;
      }
      if (input.executionCompleted === true) {
        patch["sessionMemory.executionCompletedAt"] = now;
      }
      tx.update(ref, patch);
      return;
    }

    tx.update(ref, {
      "sessionMemory.reflection": {
        fearRating: compactString(input.reflection?.fearRating, 10),
        worked: compactString(input.reflection?.worked, 4000),
        needsWork: compactString(input.reflection?.needsWork, 4000),
        standout: compactString(input.reflection?.standout, 4000),
        savedAt: now,
        coachUid: actor.uid,
      },
      updatedAt: now,
    });
  });

  return { ok: true, practiceId, operation };
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
