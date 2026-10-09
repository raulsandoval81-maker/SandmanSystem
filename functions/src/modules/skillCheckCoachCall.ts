import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import { reconcileHistoryPages, type HistoryPage } from "./historicalSkillReconciliation";

import {
  normalizeStaffList,
  normalizeStaffRole,
  normalizeStaffScope,
  requireActiveStaff,
  staffHasLocation,
} from "../services/staffAuthorization";

const SKILL_CHECK_STAFF_ROLES = Object.freeze([
  "admin",
  "coach",
]);

function requireSkillCheckAthleteAccess(
  actor: {
    uid: string;
    role: string;
    staff: Record<string, unknown>;
  },
  athlete: Record<string, unknown>
): void {
  if (normalizeStaffRole(actor.role) === "admin") return;

  if (normalizeStaffRole(actor.role) !== "coach") {
    throw new HttpsError(
      "permission-denied",
      "This athlete is outside the Coach's authorized training scope."
    );
  }

  const assignedCoachIds = normalizeStaffList(
    athlete.coachUid,
    athlete.coachIds
  );

  const directlyAssigned =
    assignedCoachIds.includes(actor.uid);

  const locationId =
    String(athlete.locationId ?? "").trim();

  if (
    !directlyAssigned &&
    !staffHasLocation(actor.staff, locationId)
  ) {
    throw new HttpsError(
      "permission-denied",
      "This athlete is outside the Coach's authorized training scope."
    );
  }
}

const ALLOWED_STATES = Object.freeze([
  "NOT_INTRODUCED",
  "LEARNED",
  "APPLIED",
  "MASTERED",
  "REFINED",
]);

const WRESTLING_FAMILIES = Object.freeze([
  "stance_motion",
  "level_change_entry",
  "angle",
  "head_position",
  "distance",
  "tempo",
  "pressure_footwork",
  "motion_attack_reattack",
  "double_leg",
  "single_leg",
  "setups_ties",
  "snap_go_behind",
  "arm_drag",
  "reattack_reshot",
  "chain_wrestling",
  "underhook",
  "two_on_one",
  "upper_body",
  "shot_defense",
  "down_block",
  "counter_offense",
  "front_headlock",
  "whizzer",
  "scramble",
  "ride_control",
  "return",
  "turn_system",
  "crossface",
  "leg_ride",
  "escape",
  "stand_up",
  "sitout_switch",
  "hip_heist",
  "reversal",
  "survival_recovery",
  "bottom_integration",
]);

const BOXING_FAMILIES = Object.freeze([
  "stance_motion",
  "distance_range",
  "angles_pivots",
  "jab_system",
  "cross_system",
  "hook_system",
  "uppercut",
  "body_attack",
  "combination_flow",
  "slip_head_movement",
  "roll",
  "parry",
  "block_shell",
  "defense_reset",
  "defense_to_offense",
  "counter_punching",
  "timing_rhythm",
  "feints_setups",
  "pressure_boxing",
  "inside_boxing",
  "ringcraft",
  "tempo_pace",
  "fight_iq",
  "live_application",
  "conditioning_composure",
  "finishing",
  "leadership_mastery",
]);

const MUAY_THAI_FAMILIES = Object.freeze([
  "stance_motion",
  "guard_defense",
  "head_movement",
  "distance_range",
  "angles_pivots",
  "jab_system",
  "cross_system",
  "hook_system",
  "uppercut",
  "body_attack",
  "teep_system",
  "kick_system",
  "knee_system",
  "elbow_system",
  "clinch_system",
  "check_kick_defense",
  "combination_flow",
  "timing_rhythm",
  "feints_setups",
  "counter_striking",
  "defense_reset",
  "defense_to_offense",
  "pressure",
  "inside_fighting",
  "ringcraft",
  "tempo_pace",
  "fight_iq",
  "weapon_integration",
  "live_application",
  "conditioning_composure",
  "finishing",
  "leadership_mastery",
]);

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeFamily(value: unknown): string {
  return clean(value).toLowerCase();
}

function normalizeDiscipline(value: unknown): string {
  const raw = clean(value).toLowerCase();

  if (raw.includes("wrest")) return "wrestling";

  if (
    raw.includes("muay") ||
    raw.includes("kickbox")
  ) {
    return "muay-thai";
  }

  if (raw.includes("box")) return "boxing";

  return raw.replace(/[\s_]+/g, "-");
}

function familiesForDiscipline(
  discipline: string
): readonly string[] {
  if (discipline === "boxing") {
    return BOXING_FAMILIES;
  }

  if (discipline === "muay-thai") {
    return MUAY_THAI_FAMILIES;
  }

  if (discipline === "wrestling") {
    return WRESTLING_FAMILIES;
  }

  return [];
}

function skillDocDiscipline(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    normalizeDiscipline(data.discipline);

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  if (separator > 0) {
    return normalizeDiscipline(
      docId.slice(0, separator)
    );
  }

  // Legacy raw family documents were Wrestling-only.
  return "wrestling";
}

function skillDocFamilyId(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    normalizeFamily(data.familyId);

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  if (separator > 0) {
    return normalizeFamily(
      docId.slice(separator + 2)
    );
  }

  return normalizeFamily(docId);
}

function normalizeState(value: unknown): string {
  return clean(value).toUpperCase();
}

function optionalPracticeId(value: unknown): string {
  const practiceId = clean(value);
  if (!practiceId) return "";
  if (practiceId.length > 160 || practiceId.includes("/") || practiceId === "." || practiceId === ".."
    || /[\u0000-\u001f\u007f]/.test(practiceId)) {
    throw new HttpsError("invalid-argument", "practiceId is invalid.");
  }
  return practiceId;
}

function requirePracticeVerificationAccess(
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  practice: Record<string, unknown>
): void {
  if (normalizeStaffRole(actor.role) === "admin") return;
  const locationId = clean(practice.locationId || practice.academyId);
  if (!locationId || !staffHasLocation(actor.staff, locationId)) {
    throw new HttpsError("permission-denied", "Practice location is outside the Coach's authorized scope.");
  }
  if (clean(practice.coachUid) !== actor.uid) {
    throw new HttpsError("permission-denied", "Only the Coach who opened this practice may attach Skill Check evidence.");
  }
}

// History reads may include a different originating Coach, but only within
// the athlete's current authorized location. Practice write ownership is unchanged.
function requireHistoricalPracticeReadAccess(
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  practice: Record<string, unknown>,
  athleteLocationId: string,
  athleteAcademyId: string
): void {
  const locationId = clean(practice.locationId);
  const academyId = clean(practice.academyId);
  const admin = normalizeStaffRole(actor.role) === "admin";
  if (locationId) {
    if (!athleteLocationId || locationId !== athleteLocationId
        || (!admin && !staffHasLocation(actor.staff, locationId))) {
      throw new HttpsError("permission-denied", "Historical practice is outside the athlete's authorized location.");
    }
    return;
  }
  // Legacy fallback applies only to practices with no locationId, and only
  // with an explicit athlete/staff academy match. It never overrides a
  // conflicting locationId or infers authorization from a coach assignment.
  if (!academyId || !athleteAcademyId || academyId !== athleteAcademyId
      || (!admin && !normalizeStaffScope(actor.staff).academyIds.includes(academyId))) {
    throw new HttpsError("permission-denied", "Historical practice is outside the athlete's authorized academy.");
  }
}

function attendanceIncludesAthlete(attendance: Record<string, unknown>, athleteId: string): boolean {
  const presentIds = Array.isArray(attendance.presentIds) ? attendance.presentIds : [];
  const present = Array.isArray(attendance.present) ? attendance.present : [];
  return presentIds.some((id) => clean(id).toUpperCase() === athleteId)
    || present.some((athlete: any) => clean(athlete?.id || athlete?.uid).toUpperCase() === athleteId);
}

export const skillCheckCoachCall =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }

    const actor = await requireActiveStaff(
      req.auth.uid,
      SKILL_CHECK_STAFF_ROLES,
      "Active Coach access required."
    );

    const data = req.data || {};
    const action = clean(data.action).toLowerCase();
    const athleteId = clean(
      data.athleteId || data.uid
    ).toUpperCase();

    const discipline =
      normalizeDiscipline(
        data.discipline || "wrestling"
      );

    if (!["wrestling", "boxing", "muay-thai"].includes(
      discipline
    )) {
      throw new HttpsError(
        "invalid-argument",
        "Unsupported Skill Check discipline."
      );
    }

    if (!athleteId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid athlete ID is required."
      );
    }

    const db = getFirestore();

    const athleteSnap = await db
      .doc(`athletes/${athleteId}`)
      .get();

    if (!athleteSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Athlete not found: ${athleteId}`
      );
    }

    const athlete =
      athleteSnap.data() || {};

    requireSkillCheckAthleteAccess(
      actor,
      athlete
    );

    if (action === "historical-coverage-preflight") {
      // Server-owned discovery inventory. This deliberately does not claim
      // completeness from a bounded query or infer any development state.
      const locationId = clean(athlete.locationId);
      const academyId = clean(athlete.academyId);
      const admin = normalizeStaffRole(actor.role) === "admin";
      const authorizedLocation = Boolean(locationId)
        && (admin || staffHasLocation(actor.staff, locationId));
      const authorizedAcademy = Boolean(academyId)
        && (admin || normalizeStaffScope(actor.staff).academyIds.includes(academyId));
      const specifications = [
        { scope: "coach", field: "coachUid", value: actor.uid, enabled: true },
        { scope: "athlete-location", field: "locationId", value: locationId, enabled: authorizedLocation },
        { scope: "athlete-academy", field: "academyId", value: academyId, enabled: authorizedAcademy },
      ];
      const scopes = [];
      for (const spec of specifications) {
        if (!spec.enabled) {
          scopes.push({ scope: spec.scope, accessible: false, sampled: 0, morePages: null });
          continue;
        }
        const snapshot = await db.collection("practiceSessions")
          .where(spec.field, "==", spec.value)
          .orderBy(FieldPath.documentId())
          .limit(51)
          .get();
        const candidates = snapshot.docs.slice(0, 50)
          .filter(doc => normalizeDiscipline(doc.data().discipline) === discipline)
          .filter(doc => spec.scope !== "athlete-academy" || !clean(doc.data().locationId));
        scopes.push({
          scope: spec.scope, accessible: true, sampled: snapshot.size > 50 ? 50 : snapshot.size,
          matchingDisciplineSample: candidates.length,
          morePages: snapshot.size > 50,
          // This cursor is a discovery hint, not proof of coverage.
          nextCursor: snapshot.size > 50 ? snapshot.docs[49].id : null,
        });
      }
      return {
        ok: true, athleteId, discipline, diagnosticOnly: true,
        scopes, coverageComplete: false, eligibleForAuto: false,
        blockers: [
          "sampled-scope-inventory-only",
          "complete-historical-pagination-required",
          "cross-scope-evidence-reconciliation-required",
          "historical-transfers-unverified",
        ],
      };
    }

    if (action === "verify-historical-evidence-batch") {
      // Re-read authoritative Firestore records for explicitly requested
      // practices. This does not assert that other historical records do not exist.
      const ids: unknown = data.practiceIds;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20
          || ids.some(id => typeof id !== "string")) {
        throw new HttpsError("invalid-argument", "Supply 1–20 practice IDs.");
      }
      const practiceIds = ids.map(id => optionalPracticeId(id));
      if (practiceIds.some(id => !id) || new Set(practiceIds).size !== practiceIds.length) {
        throw new HttpsError("invalid-argument", "Historical practice IDs must be unique.");
      }
      const verifiedHistory = [];
      for (const practiceId of practiceIds) {
        const [practiceSnap, attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`practiceSessions/${practiceId}`).get(),
          db.doc(`attendance_sessions/${practiceId}`).get(),
          db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get(),
        ]);
        if (!practiceSnap.exists || !attendanceSnap.exists || !memorySnap.exists) {
          throw new HttpsError("failed-precondition", "Historical practice evidence is missing.");
        }
        const practice = practiceSnap.data() || {};
        requireHistoricalPracticeReadAccess(actor, practice, clean(athlete.locationId), clean(athlete.academyId));
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline
            || clean(attendance.practiceId) !== practiceId
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== practiceId
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
          throw new HttpsError("failed-precondition", "Historical attendance and session memory do not agree.");
        }
        const evidence = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`).get();
        if (evidence.empty) throw new HttpsError("failed-precondition", "No verified skills in historical practice.");
        const verifiedSkills = evidence.docs.map(item => item.data() || {})
          .filter(skill => normalizeDiscipline(skill.discipline) === discipline
            && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
            && ALLOWED_STATES.includes(normalizeState(skill.state)))
          .map(skill => ({
            familyId: normalizeFamily(skill.familyId),
            state: normalizeState(skill.state),
            coachUid: clean(skill.coachUid),
            verifiedAt: skill.verifiedAt instanceof Timestamp ? skill.verifiedAt.toDate().toISOString() : null,
          }));
        if (!verifiedSkills.length) {
          throw new HttpsError("failed-precondition", "No matching verified skill observations.");
        }
        verifiedHistory.push({
          practiceId, sessionDateKey: clean(practice.sessionDateKey), verifiedSkills,
        });
      }
      const summary = reconcileHistoryPages([{
        athleteId, discipline, scope: "verified-batch",
        cursor: null, nextCursor: null, scopeExhausted: true,
        history: verifiedHistory,
      }], ["verified-batch"], athleteId, discipline);
      return {
        ok: true, diagnosticOnly: true, source: "server-verified-firestore",
        ...summary, coverageComplete: false, eligibleForAuto: false,
        blockers: [...new Set([...summary.blockers,
          "explicit-practice-batch-does-not-prove-complete-history"])].sort(),
      };
    }

    if (action === "reconcile-verified-history-preview") {
      // Diagnostic only: caller-provided discovery pages are untrusted and
      // cannot authorize curriculum, progression or XP changes.
      const rawPages: unknown = data.pages;
      const rawScopes: unknown = data.scopes;
      if (!Array.isArray(rawPages) || rawPages.length > 100
          || !Array.isArray(rawScopes) || rawScopes.length > 3
          || rawScopes.some(scope => !["coach", "athlete-location", "athlete-academy"].includes(scope))
          || new Set(rawScopes).size !== rawScopes.length) {
        throw new HttpsError("invalid-argument", "Invalid reconciliation preview inputs.");
      }
      const pages: HistoryPage[] = [];
      for (const raw of rawPages) {
        if (!raw || typeof raw !== "object") {
          throw new HttpsError("invalid-argument", "Invalid history page.");
        }
        const page = raw as Record<string, unknown>;
        if (typeof page.scope !== "string"
            || !rawScopes.includes(page.scope)
            || page.athleteId !== athleteId || page.discipline !== discipline
            || typeof page.scopeExhausted !== "boolean"
            || !Array.isArray(page.history) || page.history.length > 50
            || page.history.some((item: unknown) => {
              if (!item || typeof item !== "object") return true;
              const entry = item as Record<string, unknown>;
              return typeof entry.practiceId !== "string"
                || typeof entry.sessionDateKey !== "string"
                || !Array.isArray(entry.verifiedSkills)
                || entry.verifiedSkills.length > 100
                || entry.verifiedSkills.some((skill: unknown) => {
                  if (!skill || typeof skill !== "object") return true;
                  const value = skill as Record<string, unknown>;
                  return typeof value.familyId !== "string"
                    || typeof value.state !== "string"
                    || typeof value.coachUid !== "string"
                    || (value.verifiedAt !== null && typeof value.verifiedAt !== "string");
                });
            })) {
          throw new HttpsError("invalid-argument", "History preview page mismatch.");
        }
        pages.push(page as unknown as HistoryPage);
      }
      const summary = reconcileHistoryPages(pages, rawScopes as string[], athleteId, discipline);
      return {
        ok: true,
        diagnosticOnly: true,
        ...summary,
        // These inputs are supplied by the client rather than re-fetched
        // from Firestore; they are never verified source-of-truth evidence.
        coverageComplete: false,
        eligibleForAuto: false,
        blockers: [...new Set([...summary.blockers, "client-supplied-pages-untrusted"])].sort(),
      };
    }

    if (action === "discover-verified-practices") {
      // Deterministic, cursor-paged discovery within the requesting Coach's
      // scope. Exhaustive history remains unproven until cross-Coach
      // discovery, page traversal, and chronology are reconciled.
      const cursor = clean(data.cursor);
      if (cursor) optionalPracticeId(cursor);
      const pageSize = 50;
      const scope = clean(data.scope).toLowerCase() || "coach";
      if (!["coach", "athlete-location", "athlete-academy"].includes(scope)) {
        throw new HttpsError("invalid-argument", "Unsupported history scope.");
      }
      const athleteLocationId = clean(athlete.locationId);
      const athleteAcademyId = clean(athlete.academyId);
      if (scope === "athlete-academy" && (!athleteAcademyId
          || (normalizeStaffRole(actor.role) !== "admin"
            && !normalizeStaffScope(actor.staff).academyIds.includes(athleteAcademyId)))) {
        throw new HttpsError("permission-denied", "Athlete academy is not authorized for historical discovery.");
      }
      if (scope === "athlete-location" && (!athleteLocationId
          || (normalizeStaffRole(actor.role) !== "admin"
            && !staffHasLocation(actor.staff, athleteLocationId)))) {
        throw new HttpsError("permission-denied", "Athlete location is not authorized for historical discovery.");
      }
      let query = db.collection("practiceSessions")
        .where(scope === "coach" ? "coachUid" : scope === "athlete-location" ? "locationId" : "academyId", "==",
          scope === "coach" ? actor.uid : scope === "athlete-location" ? athleteLocationId : athleteAcademyId)
        .orderBy(FieldPath.documentId())
        .limit(pageSize + 1);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      const hasMore = page.size > pageSize;
      const candidates = page.docs.slice(0, pageSize);
      const nextCursor = hasMore ? candidates[candidates.length - 1].id : null;
      const includeEvidence = data.includeEvidence === true;
      const matching: { practiceId: string; sessionDateKey: string }[] = [];
      const history: { practiceId: string; sessionDateKey: string; verifiedSkills: { familyId: string; state: string; verifiedAt: string | null; coachUid: string }[] }[] = [];
      for (const candidate of candidates) {
        const practiceId = candidate.id;
        const practice = candidate.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline) continue;
        if (scope === "athlete-academy" && clean(practice.locationId)) continue;
        if (scope === "athlete-location") {
          requireHistoricalPracticeReadAccess(actor, practice, athleteLocationId, athleteAcademyId);
        } else if (scope === "athlete-academy") {
          // Legacy academy-only records are accepted only when their location
          // is absent and the actor has explicit academy access.
          if (clean(practice.locationId) || clean(practice.academyId) !== athleteAcademyId
              || (normalizeStaffRole(actor.role) !== "admin"
                && !normalizeStaffScope(actor.staff).academyIds.includes(athleteAcademyId))) {
            throw new HttpsError("permission-denied", "Legacy practice academy is outside authorized scope.");
          }
        } else {
          requirePracticeVerificationAccess(actor, practice);
        }
        const [attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`attendance_sessions/${practiceId}`).get(),
          db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get(),
        ]);
        if (!attendanceSnap.exists || !memorySnap.exists) continue;
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        if (clean(attendance.practiceId) !== practiceId
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== practiceId
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") continue;
        const verified = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`)
          .get();
        if (verified.empty) continue;
        const sessionDateKey = clean(practice.sessionDateKey);
        matching.push({ practiceId, sessionDateKey });
        if (includeEvidence) {
          history.push({
            practiceId,
            sessionDateKey,
            verifiedSkills: verified.docs.map(docSnap => docSnap.data() || {})
              .filter(skill => normalizeDiscipline(skill.discipline) === discipline
                && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
                && ALLOWED_STATES.includes(normalizeState(skill.state)))
              .map(skill => ({
                familyId: normalizeFamily(skill.familyId),
                state: normalizeState(skill.state),
                verifiedAt: skill.verifiedAt instanceof Timestamp ? skill.verifiedAt.toDate().toISOString() : null,
                coachUid: clean(skill.coachUid),
              })),
          });
        }
      }
      // A deterministic evidence inventory only; conflicting states are never
      // silently reduced to a presumed mastery level or a latest progression.
      const families = new Map<string, { states: Set<string>; observations: number }>();
      for (const practice of history) {
        for (const skill of practice.verifiedSkills) {
          const previous = families.get(skill.familyId) || { states: new Set<string>(), observations: 0 };
          previous.states.add(skill.state);
          previous.observations += 1;
          families.set(skill.familyId, previous);
        }
      }
      const familyEvidence = [...families.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([familyId, record]) => ({
          familyId,
          states: [...record.states].sort(),
          observations: record.observations,
          conflictingStates: record.states.size > 1,
          // Partial historical coverage cannot establish the current state,
          // even when all sampled observations happen to agree.
          currentState: null,
          progressionStatus: record.states.size > 1 ? "conflicting-history" : "incomplete-history",
          eligibleForAuto: false,
        }));
      const chronologyComplete = history.length > 0 && history.every(practice => {
        const date = practice.sessionDateKey;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
          || Number.isNaN(Date.parse(date + "T00:00:00.000Z"))
          || new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) !== date) {
          return false;
        }
        return practice.verifiedSkills.length > 0
          && practice.verifiedSkills.every(skill => Boolean(skill.verifiedAt)
            && !Number.isNaN(Date.parse(skill.verifiedAt as string)));
      });
      const progressionAssessment = {
        status: familyEvidence.some(item => item.conflictingStates)
          ? "requires-evidence-reconciliation" : "requires-complete-history",
        evaluatedAthleteCount: 1,
        historyExhaustive: false,
        chronologyComplete,
        autoEligible: false,
        reason: "Historical discovery is bounded and has no verified chronology for current skill state.",
      };
      return {
        ok: true, athleteId, discipline, practiceIds: matching.map(item => item.practiceId),
        practices: matching, scanned: candidates.length,
        scope, cursor: cursor || null, nextCursor, pageComplete: true,
        scopeExhausted: !hasMore,
        coverageComplete: false,
        coverageBlockers: [
          ...(hasMore ? ["additional-pages-required"] : []),
          "cross-scope-reconciliation-required",
          "historical-transfer-coverage-unverified",
          "historical-chronology-unresolved",
        ],
        coachScopeExhausted: scope === "coach" && !hasMore,
        ...(includeEvidence ? { history, familyEvidence, progressionAssessment } : {}),
        exhaustive: false,
        // Callers must not infer athlete mastery from this partial search.
        evidenceReadyForAuto: false,
        limitation: "Each discovery scope is separately paginated, and only athlete-location or explicitly authorized legacy academy-only records are eligible. Scope overlap, transfers, unindexed practices, and chronological state resolution remain unproven."
      };
    }

    if (action === "load-verified-history") {
      // Explicit practice IDs prevent unbounded collection-group searches and
      // require authorization, finalized attendance, and matching session memory
      // separately for every historical record.
      const practiceIds = Array.isArray(data.practiceIds) ? data.practiceIds : [];
      if (!practiceIds.length || practiceIds.length > 20) {
        throw new HttpsError("invalid-argument", "Supply 1–20 historical practice IDs.");
      }
      const uniqueIds = [...new Set(practiceIds.map(optionalPracticeId))];
      if (uniqueIds.length !== practiceIds.length || uniqueIds.some(id => !id)) {
        throw new HttpsError("invalid-argument", "Historical practice IDs must be unique and valid.");
      }
      const history = [];
      for (const practiceId of uniqueIds) {
        const [practiceSnap, attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`practiceSessions/${practiceId}`).get(),
          db.doc(`attendance_sessions/${practiceId}`).get(),
          db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get(),
        ]);
        if (!practiceSnap.exists || !attendanceSnap.exists || !memorySnap.exists) {
          throw new HttpsError("failed-precondition", "Historical evidence is incomplete.");
        }
        const practice = practiceSnap.data() || {};
        requireHistoricalPracticeReadAccess(actor, practice, clean(athlete.locationId), clean(athlete.academyId));
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline
            || clean(attendance.practiceId) !== practiceId
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== practiceId
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
          throw new HttpsError("failed-precondition", "Historical practice verification is inconsistent.");
        }
        const snap = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`).get();
        history.push({
          practiceId,
          verifiedSkills: snap.docs.map(docSnap => docSnap.data() || {})
            .filter(skill => normalizeDiscipline(skill.discipline) === discipline
              && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
              && ALLOWED_STATES.includes(normalizeState(skill.state)))
            .map(skill => ({
              familyId: normalizeFamily(skill.familyId),
              state: normalizeState(skill.state),
              coachUid: clean(skill.coachUid),
              verifiedAt: skill.verifiedAt || null,
            })),
        });
      }
      return { ok: true, athleteId, discipline, history };
    }

    if (action === "load-verified-practice") {
      const practiceId = optionalPracticeId(data.practiceId);
      if (!practiceId) {
        throw new HttpsError("invalid-argument", "A practiceId is required for verified evidence.");
      }
      const practiceSnap = await db.doc(`practiceSessions/${practiceId}`).get();
      if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
      const practice = practiceSnap.data() || {};
      requireHistoricalPracticeReadAccess(actor, practice, clean(athlete.locationId), clean(athlete.academyId));
      if (normalizeDiscipline(practice.discipline) !== discipline) {
        throw new HttpsError("failed-precondition", "Practice discipline does not match the requested evidence.");
      }
      const attendanceSnap = await db.doc(`attendance_sessions/${practiceId}`).get();
      const attendance = attendanceSnap.data() || {};
      if (!attendanceSnap.exists || clean(attendance.practiceId) !== practiceId
          || normalizeDiscipline(attendance.discipline) !== discipline
          || clean(attendance.status).toLowerCase() !== "finalized"
          || attendance.finalized !== true || !attendanceIncludesAthlete(attendance, athleteId)) {
        throw new HttpsError("failed-precondition", "Finalized attendance for this athlete is required.");
      }
      const memorySnap = await db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get();
      const memory = memorySnap.data() || {};
      if (!memorySnap.exists || clean(memory.practiceId) !== practiceId
          || clean(memory.athleteId).toUpperCase() !== athleteId
          || normalizeDiscipline(memory.discipline) !== discipline
          || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
        throw new HttpsError("failed-precondition", "Matching athlete-session memory is required.");
      }
      const verifiedSnap = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`).get();
      return {
        ok: true, practiceId, athleteId, discipline,
        verifiedSkills: verifiedSnap.docs
          .map(docSnap => docSnap.data() || {})
          .filter(skill => normalizeDiscipline(skill.discipline) === discipline
            && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId)))
          .map(skill => ({
            familyId: normalizeFamily(skill.familyId),
            state: normalizeState(skill.state),
            coachUid: clean(skill.coachUid),
            verifiedAt: skill.verifiedAt || null
          }))
      };
    }

    if (action === "load") {
      const snap = await db
        .collection("athletes")
        .doc(athleteId)
        .collection("skills")
        .get();

      return {
        ok: true,
        athlete: {
          id: athleteId,
          name:
            clean(athlete.publicName) ||
            clean(athlete.fullName) ||
            clean(athlete.name) ||
            athleteId,
          tier:
            clean(athlete.tier) ||
            clean(athlete.progressionTier),
          rankName:
            clean(athlete.rankName) ||
            clean(athlete.tierName),
          journey:
            clean(athlete.journey) ||
            clean(athlete.program) ||
            clean(athlete.track),
        },
        discipline,
        skills: Array.from(
          snap.docs.reduce((map, docSnap) => {
            const skillData =
              docSnap.data() || {};

            const docDiscipline =
              skillDocDiscipline(
                docSnap.id,
                skillData
              );

            if (docDiscipline !== discipline) {
              return map;
            }

            const familyId =
              skillDocFamilyId(
                docSnap.id,
                skillData
              );

            const isCanonical =
              docSnap.id ===
              `${discipline}__${familyId}`;

            const existing =
              map.get(familyId);

            if (!existing || isCanonical) {
              map.set(familyId, {
                id: docSnap.id,
                ...skillData,
                familyId,
                discipline: docDiscipline,
              });
            }

            return map;
          }, new Map<string, Record<string, unknown>>())
          .values()
        ),
      };
    }

    if (action !== "save") {
      throw new HttpsError(
        "invalid-argument",
        "Unsupported Skill Check action."
      );
    }

    const familyId =
      normalizeFamily(data.familyId);

    const allowedFamilies =
      familiesForDiscipline(discipline);

    if (!allowedFamilies.includes(familyId)) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown ${discipline} skill family.`
      );
    }

    const state =
      normalizeState(data.state);
    const practiceId = optionalPracticeId(data.practiceId);

    if (!ALLOWED_STATES.includes(
      state as typeof ALLOWED_STATES[number]
    )) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid development state."
      );
    }

    const ref = db.doc(
      `athletes/${athleteId}/skills/${discipline}__${familyId}`
    );

    const record = {
      familyId,
      discipline,
      state,
      needsReview: data.needsReview === true,

      name: clean(data.name) || familyId,

      lastJourney: clean(data.lastJourney),
      lastTier: clean(data.lastTier),
      lastCard: clean(data.lastCard),
      lastCardHref: clean(data.lastCardHref),

      coachUid: req.auth.uid,
      coachNotes: clean(data.coachNotes),

      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!practiceId) {
      await ref.set(record, { merge: true });
    } else {
      const practiceRef = db.doc(`practiceSessions/${practiceId}`);
      const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
      const athleteSessionRef = db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`);
      const verificationRef = athleteSessionRef.collection("verifiedSkills").doc(`${discipline}__${familyId}`);

      await db.runTransaction(async (tx) => {
        const [practiceSnap, attendanceSnap, athleteSessionSnap, verificationSnap] = await Promise.all([
          tx.get(practiceRef),
          tx.get(attendanceRef),
          tx.get(athleteSessionRef),
          tx.get(verificationRef),
        ]);
        if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
        const practice = practiceSnap.data() || {};
        requirePracticeVerificationAccess(actor, practice);
        const practiceDiscipline = normalizeDiscipline(practice.discipline);
        if (practiceDiscipline !== discipline) {
          throw new HttpsError("failed-precondition", "Skill Check discipline must match the practice discipline.");
        }

        if (!attendanceSnap.exists) throw new HttpsError("failed-precondition", "Finalized practice attendance is required.");
        const attendance = attendanceSnap.data() || {};
        if (clean(attendance.practiceId) !== practiceId
          || clean(attendance.status).toLowerCase() !== "finalized"
          || attendance.finalized !== true
          || normalizeDiscipline(attendance.discipline) !== discipline
          || !attendanceIncludesAthlete(attendance, athleteId)) {
          throw new HttpsError("failed-precondition", "Athlete must be present in finalized attendance for this practice.");
        }

        if (!athleteSessionSnap.exists) {
          throw new HttpsError("failed-precondition", "Finalized athlete-session memory is required.");
        }
        const athleteSession = athleteSessionSnap.data() || {};
        if (clean(athleteSession.practiceId) !== practiceId
          || clean(athleteSession.athleteId).toUpperCase() !== athleteId
          || normalizeDiscipline(athleteSession.discipline) !== discipline
          || clean((athleteSession.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
          throw new HttpsError("failed-precondition", "Athlete-session memory does not match this verification.");
        }

        tx.set(ref, record, { merge: true });
        const existing = verificationSnap.data() || {};
        const identical = verificationSnap.exists
          && clean(existing.skillId) === familyId
          && normalizeFamily(existing.familyId) === familyId
          && normalizeDiscipline(existing.discipline) === discipline
          && normalizeState(existing.state) === state
          && clean(existing.coachUid) === actor.uid;
        if (!identical) {
          tx.set(verificationRef, {
            skillId: familyId,
            familyId,
            discipline,
            state,
            coachUid: actor.uid,
            verifiedAt: FieldValue.serverTimestamp(),
            sourceVersion: 1,
          });
        }
      });
    }

    return {
      ok: true,
      athleteId,
      discipline,
      familyId,
      state,
      needsReview: record.needsReview,
      ...(practiceId ? { practiceId } : {}),
    };
  });
