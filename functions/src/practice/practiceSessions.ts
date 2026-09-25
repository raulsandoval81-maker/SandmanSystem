import { createHash } from "node:crypto";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { COACH_STAFF_ROLES, normalizeStaffRole, requireActiveStaff } from "../services/staffAuthorization";
import { staffLocationIds } from "../schedules/crossTrainingPolicy";
import { resolveQualifyingRecoveryPractice } from "../modules/decay/decayRecoveryPolicy";
import { awardReceiptKey } from "../services/authoritativeXpService";

const PRACTICE_STAFF_ROLES = COACH_STAFF_ROLES;
const EXECUTION_MODES = new Set(["manual", "hybrid", "quick", "checked-in"]);
const MEMORY_OPERATIONS = new Set(["plan", "worked", "reflection"]);
const MAX_PLAN_VERSION = 10_000;
const PRACTICE_ENTRY_MODES = new Set(["normal", "coach-directed", "after-the-fact"]);
const CANONICAL_PRACTICE_PROGRAMS = Object.freeze([
  { program: "youth-z2h-wrestling", discipline: "wrestling", journey: "Z2H", locations: ["santa-ynez-valley"] },
  { program: "youth-z2h-muay-thai", discipline: "muay-thai", journey: "Z2H", locations: ["santa-ynez-valley"] },
  { program: "teen-p2l-wrestling", discipline: "wrestling", journey: "P2L", locations: ["santa-ynez-valley"] },
  { program: "teen-p2l-boxing", discipline: "boxing", journey: "P2L", locations: ["santa-ynez-valley"] },
  { program: "fitness-striking", discipline: "striking", journey: "", locations: ["santa-ynez-valley"] },
]);

function requireDocumentId(value: unknown, field: string): string {
  const id = requiredString(value, field);
  if (id.length > 160 || id.includes("/") || id === "." || id === ".." || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return id;
}

function requireBoundedNumber(value: unknown, field: string, minimum: number, maximum: number, integer = false): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return number;
}

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

function requireSessionDateKey(value: unknown): string {
  const dateKey = requiredString(value, "sessionDateKey");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new HttpsError("invalid-argument", "sessionDateKey must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new HttpsError("invalid-argument", "sessionDateKey is not a valid calendar date.");
  }
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => todayParts.find((item) => item.type === type)?.value || "";
  const todayKey = `${part("year")}-${part("month")}-${part("day")}`;
  if (dateKey > todayKey) throw new HttpsError("invalid-argument", "sessionDateKey cannot be in the future.");
  return dateKey;
}

function requireCanonicalPracticeProgram(program: unknown, disciplineValue: unknown, locationId: string) {
  const programId = requiredString(program, "program");
  const discipline = normalizePracticeDiscipline(requiredString(disciplineValue, "discipline"));
  const policy = CANONICAL_PRACTICE_PROGRAMS.find((item) => item.program === programId);
  if (!policy || policy.discipline !== discipline || !policy.locations.includes(locationId)) {
    throw new HttpsError("failed-precondition", "This program and discipline are not available at the selected location.");
  }
  return { program: programId, discipline, journey: policy.journey };
}

function canonicalPracticeIdentity(input: { entryMode: string; sessionDateKey: string; locationId: string; discipline: string; program: string; practiceKey: string; }) {
  return ["canonical-practice-v1", input.entryMode, input.sessionDateKey, input.locationId, input.discipline, input.program, input.practiceKey].join("|");
}

function canonicalPracticeId(identity: string) {
  return `practice_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function compactString(value: unknown, max = 240): string {
  return String(value ?? "").trim().slice(0, max);
}

function compactCards(value: unknown, blockId = "") {
  if (!Array.isArray(value)) return [];
  if (value.length > 80) throw new HttpsError("invalid-argument", "Session memory cannot contain more than 80 cards.");
  const cards = value.map((item: any) => {
    const title = compactString(item?.title, 160);
    const href = compactString(item?.href, 500);
    const skillId = compactString(item?.skillId || item?.skill, 120);
    const familyId = compactString(item?.familyId || item?.family, 120);
    const cardId = compactString(item?.cardId || item?.id || href || skillId || familyId, 500);
    if (!cardId) throw new HttpsError("invalid-argument", "Every session-memory card requires an identity.");
    return {
      cardId,
      blockId: compactString(item?.blockId || blockId, 120),
      title,
      href,
      skillId,
      familyId,
      discipline: normalizePracticeDiscipline(item?.discipline),
    };
  });
  const byId = new Map<string, (typeof cards)[number]>();
  cards.forEach((card) => byId.set(card.cardId, card));
  return [...byId.values()];
}

function normalizePracticeDiscipline(value: unknown): string {
  const discipline = compactString(value, 80).toLowerCase().replace(/[\s_]+/g, "-");
  if (["kickboxing", "kick-boxing", "muaythai", "muay-thai"].includes(discipline)) return "muay-thai";
  return discipline;
}

function finalizedParticipants(attendance: Record<string, any>) {
  const present = Array.isArray(attendance.present) ? attendance.present : [];
  const byId = new Map<string, Record<string, any>>();
  present.forEach((athlete: any) => {
    const athleteId = requireDocumentId(athlete?.id || athlete?.uid, "present athleteId");
    byId.set(athleteId, athlete || {});
  });
  const presentIds = Array.isArray(attendance.presentIds) ? attendance.presentIds : [];
  presentIds.forEach((value: unknown) => {
    const athleteId = requireDocumentId(value, "present athleteId");
    if (!byId.has(athleteId)) byId.set(athleteId, {});
  });
  return [...byId.entries()].map(([athleteId, athlete]) => ({ athleteId, athlete }));
}

function athleteSessionWorkedMemory(practice: Record<string, any>, discipline: string) {
  const source = Array.isArray(practice?.sessionMemory?.workedCards)
    ? practice.sessionMemory.workedCards
    : [];
  const cards = compactCards(source)
    .filter((card) => !card.discipline || card.discipline === discipline)
    .map(({ cardId, blockId, skillId, familyId, title }) => ({
      cardId, blockId, skillId, familyId, title,
    }));
  const skillMap = new Map<string, { skillId: string; familyId: string }>();
  cards.forEach(({ skillId, familyId }) => {
    if (!skillId && !familyId) return;
    const key = `${skillId}__${familyId}`;
    if (!skillMap.has(key)) skillMap.set(key, { skillId, familyId });
  });
  return { workedCards: cards, workedSkillRefs: [...skillMap.values()] };
}

function athleteSessionRecord(args: {
  practiceId: string;
  attendance: Record<string, any>;
  practice: Record<string, any>;
  athleteId: string;
  athlete: Record<string, any>;
  now: FirebaseFirestore.FieldValue;
}) {
  const discipline = normalizePracticeDiscipline(args.attendance.discipline || args.practice.discipline);
  const worked = athleteSessionWorkedMemory(args.practice, discipline);
  return {
    practiceId: args.practiceId,
    attendanceSessionId: args.practiceId,
    athleteId: args.athleteId,
    attendance: { status: "present", finalizedAt: args.attendance.finalizedAt || args.now },
    sessionDate: compactString(args.attendance.sessionDateKey, 80),
    locationId: compactString(args.practice.locationId || args.practice.academyId, 160),
    roomId: compactString(args.practice.roomId, 160),
    discipline,
    journey: compactString(args.athlete.journey || args.practice.journey, 120),
    program: compactString(args.athlete.program || args.practice.program, 160),
    rankSnapshot: compactString(args.athlete.rank, 120),
    tierSnapshot: compactString(args.athlete.tier, 120),
    workedCards: worked.workedCards,
    workedSkillRefs: worked.workedSkillRefs,
    createdAt: args.now,
    updatedAt: args.now,
    finalizedAt: args.attendance.finalizedAt || args.now,
    sourceVersion: 1,
  };
}

function sameIds(left: unknown, right: unknown) {
  const normalize = (value: unknown) => [...new Set(
    (Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean)
  )].sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function qualifiesForDecayRecovery(practice: Record<string, any>) {
  const type = `${practice.journey || ""}-${practice.discipline || "practice"}`.toLowerCase();
  return ["attendance", "combat", "practice", "open_mat", "daily_grind", "tournament", "p2l", "z2h", "r2g", "q2m"]
    .some((token) => type.includes(token));
}

function compactBlocks(value: unknown) {
  if (!Array.isArray(value)) return [];
  if (value.length > 20) throw new HttpsError("invalid-argument", "Session memory cannot contain more than 20 blocks.");
  const blocks = value.map((item: any) => {
    const blockId = compactString(item?.blockId || item?.id || item?.slot, 120);
    if (!blockId) throw new HttpsError("invalid-argument", "Every session-memory block requires an identity.");
    return {
      blockId,
      title: compactString(item?.title || item?.label || item?.slot, 160),
      minutes: requireBoundedNumber(item?.minutes ?? 0, "block minutes", 0, 240),
      cardIds: compactCards(item?.cards, blockId).map((card) => card.cardId),
    };
  });
  const byId = new Map<string, (typeof blocks)[number]>();
  blocks.forEach((block) => byId.set(block.blockId, block));
  return [...byId.values()];
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
  const sessionDateKey = input.sessionDateKey ? requireSessionDateKey(input.sessionDateKey) : "";
  const requestedPracticeId = input.practiceId ? requireDocumentId(input.practiceId, "practiceId") : "";
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
      entryMode: "normal",
      ...(sessionDateKey ? { sessionDateKey } : {}),
      discipline,
      journey: String(input.journey || "").trim(),
      program: String(input.program || "").trim(),
      track: String(input.track || "").trim(),
      tier: String(input.tier || "").trim(),
      schema: String(input.schema || "").trim(),
      durationMinutes: requireBoundedNumber(input.durationMinutes ?? 0, "durationMinutes", 0, 480),
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

export const createOrRecoverCanonicalPractice = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
  const input = request.data || {};
  const entryMode = compactString(input.entryMode, 40).toLowerCase();
  if (!PRACTICE_ENTRY_MODES.has(entryMode) || entryMode === "normal") {
    throw new HttpsError("invalid-argument", "entryMode must be coach-directed or after-the-fact.");
  }
  const locationId = requiredString(input.locationId, "locationId");
  requirePracticeLocation(actor, locationId);
  const sessionDateKey = requireSessionDateKey(input.sessionDateKey);
  const { program, discipline, journey } = requireCanonicalPracticeProgram(input.program, input.discipline, locationId);
  const suppliedPracticeKey = compactString(input.practiceKey, 120);
  if (entryMode === "after-the-fact" && !suppliedPracticeKey) {
    throw new HttpsError("invalid-argument", "practiceKey is required for after-the-fact entry.");
  }
  if (suppliedPracticeKey && !/^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(suppliedPracticeKey)) {
    throw new HttpsError("invalid-argument", "practiceKey is invalid.");
  }
  const practiceKey = suppliedPracticeKey || "coach-directed";
  const intendedSessionIdentity = canonicalPracticeIdentity({ entryMode, sessionDateKey, locationId, discipline, program, practiceKey });
  const practiceId = canonicalPracticeId(intendedSessionIdentity);
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  let idempotent = false;
  let status = "active";

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(practiceRef);
    if (existing.exists) {
      const current = existing.data() || {};
      if (String(current.intendedSessionIdentity || "") !== intendedSessionIdentity) {
        throw new HttpsError("already-exists", "The deterministic practice identity is already in use.");
      }
      requirePracticeLocation(actor, requiredString(current.locationId, "practice locationId"));
      status = requiredString(current.status, "practice status");
      idempotent = true;
      return;
    }
    const now = FieldValue.serverTimestamp();
    tx.create(practiceRef, {
      practiceId, intendedSessionIdentity, sessionDateKey, entryMode, practiceKey,
      locationId, academyId: locationId, discipline, program,
      journey,
      roomId: compactString(input.roomId, 160),
      coachUid: actor.uid, coachRole: actor.role,
      status: "active", source: "practice-entry", openedAt: now, updatedAt: now,
    });
  });

  return { ok: true, practiceId, status, entryMode, sessionDateKey, idempotent };
});

export const getPracticeAttendanceReview = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const db = getFirestore();
  const practiceSnap = await db.doc(`practiceSessions/${practiceId}`).get();
  if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
  const practice = practiceSnap.data() || {};
  const locationId = requiredString(practice.locationId || practice.academyId, "practice locationId");
  requirePracticeLocation(actor, locationId);
  if (!["active", "closed"].includes(String(practice.status || "").toLowerCase())) {
    throw new HttpsError("failed-precondition", "Practice attendance is not available in this state.");
  }
  const [attendanceSnap, rosterSnap, athleteInputSnap] = await Promise.all([
    db.doc(`attendance_sessions/${practiceId}`).get(),
    db.collection("athletes").where("locationId", "==", locationId).get(),
    db.collection(`practiceSessions/${practiceId}/athletes`).get(),
  ]);
  const roster = rosterSnap.docs
    .map((snap): Record<string, any> => ({ athleteId: snap.id, ...(snap.data() || {}) }))
    .filter((athlete) => String(athlete.rosterStatus || "current").toLowerCase() === "current")
    .map((athlete) => ({
      id: athlete.athleteId,
      uid: athlete.uid || athlete.athleteId,
      name: athlete.name || athlete.publicName || athlete.fullName || athlete.athleteId,
      publicName: athlete.publicName || "",
      fullName: athlete.fullName || "",
      program: athlete.program || "",
      journey: athlete.journey || "",
      profileType: athlete.profileType || "",
      ladderKey: athlete.ladderKey || "",
      tier: athlete.tier || "",
      rank: athlete.rank || "",
    }));
  const athleteInputs = athleteInputSnap.docs.reduce<Record<string, any>>((result, snap) => {
    const input = snap.data()?.coachInput;
    if (input && typeof input === "object") result[snap.id] = input;
    return result;
  }, {});
  return { ok: true, practiceId, practice, attendance: attendanceSnap.data() || null, roster, athleteInputs };
});

export const updatePracticeCheckIn = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const action = compactString(request.data?.action, 20).toLowerCase();
  if (!new Set(["start", "add", "remove", "submit"]).has(action)) {
    throw new HttpsError("invalid-argument", "Unsupported check-in action.");
  }
  const athleteId = ["add", "remove"].includes(action)
    ? requireDocumentId(request.data?.athleteId, "athleteId") : "";
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
  let result: Record<string, any> = {};
  await db.runTransaction(async (tx) => {
    const practiceSnap = await tx.get(practiceRef);
    if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
    const practice = practiceSnap.data() || {};
    const locationId = requiredString(practice.locationId || practice.academyId, "practice locationId");
    requirePracticeLocation(actor, locationId);
    if (String(practice.status || "").toLowerCase() !== "active") {
      throw new HttpsError("failed-precondition", "Check-in requires an active practice.");
    }
    if (String(practice.entryMode || "normal") === "after-the-fact") {
      throw new HttpsError("failed-precondition", "After-the-fact attendance uses verified participants, not historical check-ins.");
    }
    const attendanceSnap = await tx.get(attendanceRef);
    const existing = attendanceSnap.data() || {};
    if (["pending_review", "finalized"].includes(String(existing.status || "").toLowerCase())) {
      throw new HttpsError("failed-precondition", "This attendance record is already submitted.");
    }
    let athlete: Record<string, any> | null = null;
    if (action === "add") {
      const athleteSnap = await tx.get(db.doc(`athletes/${athleteId}`));
      if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
      athlete = athleteSnap.data() || {};
      if (String(athlete.locationId || "") !== locationId) {
        throw new HttpsError("permission-denied", "Athlete is outside the practice location.");
      }
    }
    const checkedIn = new Map<string, Record<string, any>>(
      (Array.isArray(existing.checkedIn) ? existing.checkedIn : [])
        .map((item: any): [string, Record<string, any>] => [String(item.id || item.uid || ""), item])
        .filter(([id]) => Boolean(id))
    );
    const now = FieldValue.serverTimestamp();
    if (action === "add" && athlete) {
      checkedIn.set(athleteId, {
        id: athleteId, uid: athlete.uid || athleteId,
        name: athlete.name || athlete.publicName || athlete.fullName || athleteId,
        publicName: athlete.publicName || "", fullName: athlete.fullName || "",
        program: athlete.program || "", journey: athlete.journey || "",
        profileType: athlete.profileType || "", tier: athlete.tier || "", rank: athlete.rank || "",
        checkedInAt: Timestamp.now(),
      });
    }
    if (action === "remove") checkedIn.delete(athleteId);
    if (action === "submit" && checkedIn.size === 0) {
      throw new HttpsError("failed-precondition", "At least one athlete must be checked in before review.");
    }
    const sessionDateKey = practice.sessionDateKey || requireSessionDateKey(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    );
    const values = [...checkedIn.values()];
    const ids = [...checkedIn.keys()];
    result = {
      ...existing, practiceId, sessionId: practiceId,
      liveSessionId: practice.liveSessionId || "", locationId, academyId: locationId,
      roomId: practice.roomId || "", sessionDateKey,
      journey: practice.journey || "", discipline: normalizePracticeDiscipline(practice.discipline),
      type: `${practice.journey || "session"}-${practice.discipline || "practice"}`,
      coach: existing.coach || actor.uid, coachUid: actor.uid,
      notes: action === "start" ? compactString(request.data?.notes, 4000) : (existing.notes || ""),
      status: action === "submit" ? "pending_review" : "draft",
      readyForDailyGrind: false, finalized: false,
      checkedIn: values, checkedInIds: ids, checkedInCount: ids.length,
      updatedAt: now, source: "athlete-check-in",
      ...(attendanceSnap.exists ? {} : { createdAt: now }),
      ...(action === "submit" ? { submittedAt: now, submittedBy: actor.uid } : {}),
    };
    tx.set(attendanceRef, result, { merge: true });
  });
  return { ok: true, practiceId, attendance: result };
});

export const finalizePracticeAttendance = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const requestedPresentIds: string[] = [...new Set<string>(
    (Array.isArray(request.data?.presentIds) ? request.data.presentIds : [])
      .map((value: unknown) => requireDocumentId(value, "present athleteId"))
  )];
  if (!requestedPresentIds.length) throw new HttpsError("invalid-argument", "At least one verified participant is required.");
  const notes = compactString(request.data?.notes, 4000);
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
  let idempotent = false;

  await db.runTransaction(async (tx) => {
    const [practiceSnap, attendanceSnap] = await Promise.all([tx.get(practiceRef), tx.get(attendanceRef)]);
    if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
    const practice = practiceSnap.data() || {};
    const locationId = requiredString(practice.locationId || practice.academyId, "practice locationId");
    requirePracticeLocation(actor, locationId);
    const sessionDateKey = requireSessionDateKey(practice.sessionDateKey || attendanceSnap.data()?.sessionDateKey);
    const existing = attendanceSnap.data() || {};
    if (attendanceSnap.exists && String(existing.practiceId || practiceId) !== practiceId) {
      throw new HttpsError("failed-precondition", "Attendance identity does not match the canonical practice.");
    }
    const alreadyFinalized = String(existing.status || "").toLowerCase() === "finalized";
    if (alreadyFinalized && sameIds(existing.presentIds, requestedPresentIds) && String(existing.notes || "") === notes) {
      idempotent = true;
      return;
    }
    if (String(practice.status || "").toLowerCase() !== "active") {
      throw new HttpsError("failed-precondition", "Attendance can only be finalized while the practice remains active.");
    }

    const xpEvidence = await tx.get(
      db.collection("xpLogs").where("meta.attendanceSessionId", "==", practiceId).limit(1)
    );
    if (!xpEvidence.empty) {
      throw new HttpsError("failed-precondition", "Attendance cannot be corrected after attendance-linked XP has been awarded.");
    }
    if (alreadyFinalized) {
      throw new HttpsError("failed-precondition", "Finalized attendance cannot be materially changed in this workflow.");
    }

    const athleteRefs = requestedPresentIds.map((athleteId) => db.doc(`athletes/${athleteId}`));
    const athleteSnaps = await Promise.all(athleteRefs.map((ref) => tx.get(ref)));
    const athleteSessionRefs = requestedPresentIds.map((athleteId) => db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`));
    const athleteSessionSnaps = await Promise.all(athleteSessionRefs.map((ref) => tx.get(ref)));
    const athletes = athleteSnaps.map((snap, index) => {
      if (!snap.exists) throw new HttpsError("not-found", `Athlete not found: ${requestedPresentIds[index]}`);
      const athlete = snap.data() || {};
      if (String(athlete.locationId || "") !== locationId) {
        throw new HttpsError("permission-denied", `Athlete is outside the practice location: ${requestedPresentIds[index]}`);
      }
      if (String(athlete.rosterStatus || "current").toLowerCase() !== "current") {
        throw new HttpsError("failed-precondition", `Athlete is not on the current roster: ${requestedPresentIds[index]}`);
      }
      return athlete;
    });
    const now = FieldValue.serverTimestamp();
    const discipline = normalizePracticeDiscipline(practice.discipline);
    const present = athletes.map((athlete, index) => ({
      id: requestedPresentIds[index], uid: athlete.uid || requestedPresentIds[index],
      name: athlete.name || athlete.publicName || athlete.fullName || requestedPresentIds[index],
      publicName: athlete.publicName || "", fullName: athlete.fullName || "",
      program: athlete.program || "", journey: athlete.journey || "",
      profileType: athlete.profileType || "", ladderKey: athlete.ladderKey || "",
      tier: athlete.tier || "", rank: athlete.rank || "",
    }));
    const checkedIn = Array.isArray(existing.checkedIn) ? existing.checkedIn : [];
    const checkedInIds = Array.isArray(existing.checkedInIds) ? existing.checkedInIds : [];
    const removedFromReviewIds = checkedInIds.filter((id: unknown) => !requestedPresentIds.includes(String(id)));
    const finalizedAttendance = {
      ...existing,
      practiceId, sessionId: practiceId, liveSessionId: practice.liveSessionId || existing.liveSessionId || "",
      locationId, academyId: locationId, roomId: practice.roomId || existing.roomId || "",
      sessionDateKey, journey: practice.journey || "", discipline,
      type: existing.type || `${practice.journey || "session"}-${discipline || "practice"}`,
      coach: existing.coach || actor.uid, coachUid: actor.uid, notes,
      checkedIn, checkedInIds, checkedInCount: checkedInIds.length,
      status: "finalized", readyForDailyGrind: true, finalized: true,
      finalizedAt: now, finalizedBy: actor.uid,
      present, presentIds: requestedPresentIds, presentCount: requestedPresentIds.length,
      removedFromReviewIds, updatedAt: now, source: "coach-attendance",
      ...(attendanceSnap.exists ? {} : { createdAt: now }),
    };
    tx.set(attendanceRef, finalizedAttendance, { merge: true });

    athletes.forEach((athlete, index) => {
      const recovery = resolveQualifyingRecoveryPractice({
        decay: athlete.decay || {}, practiceKey: practiceId, qualifies: qualifiesForDecayRecovery(practice),
      });
      const athletePatch: Record<string, any> = {
        lastAttendanceAt: now, lastAttendanceType: finalizedAttendance.type,
        lastAttendanceCoach: actor.uid, lastAttendanceSessionId: practiceId, updatedAt: now,
      };
      if (recovery.counts) {
        athletePatch["decay.recoveryDaysRequired"] = recovery.recoveryDaysRequired;
        athletePatch["decay.recoveryDaysCompleted"] = recovery.completedAfter;
        athletePatch["decay.recoveryLog"] = recovery.recoveryLogAfter;
        athletePatch["decay.lastRecoveryAt"] = now;
        athletePatch["decay.lastUpdatedAt"] = now;
        if (recovery.clearsRecoveryLock) {
          athletePatch["decay.state"] = "CLEAR";
          athletePatch["decay.nextHitAt"] = null;
          athletePatch["decay.clearedAt"] = now;
          athletePatch["decay.resolutionStatus"] = "RECOVERY_REQUIREMENT_COMPLETED";
          athletePatch["decay.resolutionReason"] = "Recovered after 2 verified combat practices; historical decay retained.";
          athletePatch["decay.recoveryCompletedAttendanceSessionId"] = practiceId;
          athletePatch["decay.recoveryCompletedDateKey"] = sessionDateKey;
        }
      }
      tx.update(athleteRefs[index], athletePatch);
      if (!athleteSessionSnaps[index].exists) {
        tx.create(athleteSessionRefs[index], athleteSessionRecord({
          practiceId, attendance: finalizedAttendance, practice,
          athleteId: requestedPresentIds[index], athlete, now,
        }));
      }
    });
  });

  return { ok: true, practiceId, attendanceSessionId: practiceId, status: "finalized", idempotent };
});

export const completePracticeDailyGrind = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const completedIds: string[] = [...new Set<string>(
    (Array.isArray(request.data?.athleteIds) ? request.data.athleteIds : [])
      .map((value: unknown) => requireDocumentId(value, "athleteId"))
  )];
  if (!completedIds.length) throw new HttpsError("invalid-argument", "At least one completed athlete is required.");
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
  let remainingIds: string[] = [];
  let idempotent = false;
  await db.runTransaction(async (tx) => {
    const [practiceSnap, attendanceSnap] = await Promise.all([tx.get(practiceRef), tx.get(attendanceRef)]);
    if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
    const practice = practiceSnap.data() || {};
    requirePracticeLocation(actor, requiredString(practice.locationId || practice.academyId, "practice locationId"));
    if (!attendanceSnap.exists) throw new HttpsError("not-found", "Finalized attendance not found.");
    const attendance = attendanceSnap.data() || {};
    if (String(attendance.status || "").toLowerCase() !== "finalized" || attendance.finalized !== true) {
      throw new HttpsError("failed-precondition", "Attendance must be finalized before Daily Grind completion.");
    }
    const presentIds = Array.isArray(attendance.presentIds) ? attendance.presentIds.map(String) : [];
    if (completedIds.some((athleteId) => !presentIds.includes(athleteId))) {
      throw new HttpsError("failed-precondition", "Daily Grind completion includes an athlete not present in attendance.");
    }
    const receiptRefs = completedIds.map((athleteId) => db.doc(
      `xpAwardReceipts/${awardReceiptKey(athleteId, `attendance:${practiceId}`)}`
    ));
    const receiptSnaps = await Promise.all(receiptRefs.map((ref) => tx.get(ref)));
    if (receiptSnaps.some((snap) => !snap.exists || snap.get("result.ok") !== true)) {
      throw new HttpsError("failed-precondition", "Verified attendance XP receipts are required before clearing readiness.");
    }
    const priorCompleted = Array.isArray(attendance.dailyGrindCompletedIds)
      ? attendance.dailyGrindCompletedIds.map(String) : [];
    const mergedCompleted = [...new Set([...priorCompleted, ...completedIds])];
    remainingIds = presentIds.filter((athleteId) => !mergedCompleted.includes(athleteId));
    const alreadyComplete = sameIds(priorCompleted, mergedCompleted)
      && Boolean(attendance.readyForDailyGrind) === (remainingIds.length > 0);
    if (alreadyComplete) {
      idempotent = true;
      return;
    }
    const now = FieldValue.serverTimestamp();
    tx.update(attendanceRef, {
      dailyGrindCompletedIds: mergedCompleted,
      dailyGrindRemainingIds: remainingIds,
      readyForDailyGrind: remainingIds.length > 0,
      dailyGrindUpdatedAt: now,
      ...(remainingIds.length === 0 ? { dailyGrindCompletedAt: now, dailyGrindCompletedBy: actor.uid } : {}),
    });
  });
  return { ok: true, practiceId, readyForDailyGrind: remainingIds.length > 0, remainingIds, idempotent };
});

export const savePracticeAthleteInput = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const athleteId = requireDocumentId(request.data?.athleteId, "athleteId");
  const coachObservation = compactString(request.data?.coachObservation, 4000);
  const developmentNote = compactString(request.data?.developmentNote, 4000);
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
  const athleteSessionRef = practiceRef.collection("athletes").doc(athleteId);

  await db.runTransaction(async (tx) => {
    const [practiceSnap, attendanceSnap, athleteSessionSnap] = await Promise.all([
      tx.get(practiceRef), tx.get(attendanceRef), tx.get(athleteSessionRef),
    ]);
    if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
    const practice = practiceSnap.data() || {};
    requirePracticeOwner(actor, practice);
    if (!attendanceSnap.exists) throw new HttpsError("failed-precondition", "Finalized attendance is required before athlete input.");
    const attendance = attendanceSnap.data() || {};
    if (String(attendance.practiceId || "") !== practiceId
      || String(attendance.status || "").toLowerCase() !== "finalized"
      || attendance.finalized !== true) {
      throw new HttpsError("failed-precondition", "Matching finalized attendance is required before athlete input.");
    }
    const presentIds = Array.isArray(attendance.presentIds) ? attendance.presentIds.map(String) : [];
    if (!presentIds.includes(athleteId)) {
      throw new HttpsError("failed-precondition", "Athlete input is limited to verified present athletes.");
    }
    if (!athleteSessionSnap.exists) {
      throw new HttpsError("failed-precondition", "Canonical athlete-session memory is required before athlete input.");
    }
    const now = FieldValue.serverTimestamp();
    tx.set(athleteSessionRef, {
      coachInput: {
        coachObservation,
        developmentNote,
        savedAt: now,
        coachUid: actor.uid,
      },
      updatedAt: now,
    }, { merge: true });
  });
  return { ok: true, practiceId, athleteId };
});

export const getPracticeSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
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
  const practiceId = requireDocumentId(input.practiceId, "practiceId");
  const operation = compactString(input.operation, 40).toLowerCase();
  if (!MEMORY_OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Unsupported session-memory operation.");
  }

  const db = getFirestore();
  const ref = db.doc(`practiceSessions/${practiceId}`);
  let idempotent = false;
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
      if (practice.sessionMemory?.executionStartedAt) {
        throw new HttpsError("failed-precondition", "The practice plan cannot change after execution starts.");
      }
      const planVersion = requireBoundedNumber(input.planVersion ?? 1, "planVersion", 1, MAX_PLAN_VERSION, true);
      const plannedBlocks = compactBlocks(input.plannedBlocks);
      const plannedCards = compactCards(input.plannedCards);
      tx.update(ref, {
        "sessionMemory.planVersion": planVersion,
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
      const plannedBlocks = new Set(
        (Array.isArray(memory.plannedBlocks) ? memory.plannedBlocks : []).map((block: any) => String(block.blockId || ""))
      );
      const plannedCards = new Set(
        (Array.isArray(memory.plannedCards) ? memory.plannedCards : []).map((card: any) => String(card.cardId || ""))
      );
      if (incomingBlocks.some((block) => !plannedBlocks.has(block.blockId))
        || incomingCards.some((card) => !plannedCards.has(card.cardId))) {
        throw new HttpsError("failed-precondition", "Worked memory must reference the saved practice plan.");
      }
      const blockMap = new Map(priorBlocks.map((block: any) => [String(block.blockId || ""), block]));
      incomingBlocks.forEach((block) => {
        if (!blockMap.has(block.blockId)) blockMap.set(block.blockId, { ...block, completedAt });
      });
      const cardMap = new Map(priorCards.map((card: any) => [String(card.cardId || ""), card]));
      incomingCards.forEach((card) => {
        if (!cardMap.has(card.cardId)) cardMap.set(card.cardId, { ...card, completedAt });
      });
      const patch: Record<string, any> = {
        "sessionMemory.workedBlocks": [...blockMap.values()].slice(0, 20),
        "sessionMemory.workedCards": [...cardMap.values()].slice(0, 80),
        "sessionMemory.executionUpdatedAt": now,
        updatedAt: now,
      };
      if (input.executionStarted === true && !memory.executionStartedAt) {
        patch["sessionMemory.executionStartedAt"] = now;
      }
      if (input.executionCompleted === true && !memory.executionCompletedAt) {
        patch["sessionMemory.executionCompletedAt"] = now;
      }
      tx.update(ref, patch);
      return;
    }

    const memory: any = practice.sessionMemory || {};
    const reflection = {
      fearRating: compactString(input.reflection?.fearRating, 10),
      worked: compactString(input.reflection?.worked, 4000),
      needsWork: compactString(input.reflection?.needsWork, 4000),
      standout: compactString(input.reflection?.standout, 4000),
      coachNote: compactString(input.reflection?.coachNote, 4000),
    };
    if (status === "closed" && memory.reflectionFinalizedAt) {
      const stored = memory.reflection || {};
      const isExactRetry = stored.coachUid === actor.uid
        && stored.fearRating === reflection.fearRating
        && stored.worked === reflection.worked
        && stored.needsWork === reflection.needsWork
        && stored.standout === reflection.standout
        && String(stored.coachNote || "") === reflection.coachNote;
      if (isExactRetry) {
        idempotent = true;
        return;
      }
      throw new HttpsError("failed-precondition", "The final closed-practice reflection has already been saved.");
    }
    tx.update(ref, {
      "sessionMemory.reflection": {
        ...reflection,
        savedAt: now,
        coachUid: actor.uid,
      },
      ...(status === "closed" ? { "sessionMemory.reflectionFinalizedAt": now } : {}),
      updatedAt: now,
    });
  });

  return { ok: true, practiceId, operation, idempotent };
});

export const closePracticeSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const attendanceSessionId = requireDocumentId(request.data?.attendanceSessionId, "attendanceSessionId");
  if (attendanceSessionId !== practiceId) {
    throw new HttpsError("invalid-argument", "attendanceSessionId must match the canonical practiceId.");
  }
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
    const attendanceRef = db.doc(`attendance_sessions/${attendanceSessionId}`);
    const attendanceSnap = await tx.get(attendanceRef);
    const attendance: any = attendanceSnap.data() || {};
    const attendanceDiscipline = normalizePracticeDiscipline(attendance.discipline);
    const practiceDiscipline = normalizePracticeDiscipline(practice.discipline);
    const canSeedAthleteMemory = attendanceSessionId === practiceId
      && attendanceSnap.exists
      && String(attendance.practiceId || "") === practiceId
      && String(attendance.status || "").toLowerCase() === "finalized"
      && attendance.finalized === true
      && Boolean(attendanceDiscipline)
      && attendanceDiscipline === practiceDiscipline;
    if (!attendanceSnap.exists || !canSeedAthleteMemory) {
      throw new HttpsError("failed-precondition", "Matching finalized attendance is required before closing this practice.");
    }
    const participants = canSeedAthleteMemory ? finalizedParticipants(attendance) : [];
    const athleteMemoryRefs = participants.map(({ athleteId }) =>
      db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`)
    );
    const receiptRefs = participants.map(({ athleteId }) => db.doc(
      `xpAwardReceipts/${awardReceiptKey(athleteId, `attendance:${practiceId}`)}`
    ));
    const [athleteMemorySnaps, receiptSnaps] = await Promise.all([
      Promise.all(athleteMemoryRefs.map((athleteRef) => tx.get(athleteRef))),
      Promise.all(receiptRefs.map((receiptRef) => tx.get(receiptRef))),
    ]);
    if (participants.length > 0) {
      const unresolvedReadiness = attendance.readyForDailyGrind !== false
        || (Array.isArray(attendance.dailyGrindRemainingIds) && attendance.dailyGrindRemainingIds.length > 0);
      const missingReceipt = receiptSnaps.some((receiptSnap) => !receiptSnap.exists || receiptSnap.get("result.ok") !== true);
      if (unresolvedReadiness || missingReceipt) {
        throw new HttpsError("failed-precondition", "Daily Grind must be completed for every verified participant before final close.");
      }
    }
    if (String(practice.status || "").toLowerCase() === "closed") {
      idempotent = true;
    } else {
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
    }

    if (!canSeedAthleteMemory) return;
    participants.forEach(({ athleteId, athlete }, index) => {
      if (athleteMemorySnaps[index].exists) return;
      const now = FieldValue.serverTimestamp();
      tx.create(athleteMemoryRefs[index], athleteSessionRecord({
        practiceId,
        attendance,
        practice,
        athleteId,
        athlete,
        now,
      }));
    });
  });
  return { ok: true, practiceId, status: "closed", idempotent };
});
