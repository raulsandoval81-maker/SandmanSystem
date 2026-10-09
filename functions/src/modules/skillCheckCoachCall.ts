import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  normalizeStaffList,
  normalizeStaffRole,
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

    if (action === "discover-verified-practices") {
      // Bounded discovery for the current Coach's own practices. This is not an
      // exhaustive historical search: pagination and cross-Coach scope need policy.
      const candidates = await db.collection("practiceSessions")
        .where("coachUid", "==", actor.uid)
        .limit(50)
        .get();
      const includeEvidence = data.includeEvidence === true;
      const matching: { practiceId: string; sessionDateKey: string }[] = [];
      const history: { practiceId: string; sessionDateKey: string; verifiedSkills: { familyId: string; state: string }[] }[] = [];
      for (const candidate of candidates.docs) {
        if (matching.length >= 20) break;
        const practiceId = candidate.id;
        const practice = candidate.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline) continue;
        requirePracticeVerificationAccess(actor, practice);
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
          .limit(includeEvidence ? 100 : 1).get();
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
      const progressionAssessment = {
        status: familyEvidence.some(item => item.conflictingStates)
          ? "requires-evidence-reconciliation" : "requires-complete-history",
        evaluatedAthleteCount: 1,
        historyExhaustive: false,
        autoEligible: false,
        reason: "Historical discovery is bounded and has no verified chronology for current skill state.",
      };
      return {
        ok: true, athleteId, discipline, practiceIds: matching.map(item => item.practiceId),
        practices: matching, scanned: candidates.size,
        ...(includeEvidence ? { history, familyEvidence, progressionAssessment } : {}),
        exhaustive: false,
        // Callers must not infer athlete mastery from this partial search.
        evidenceReadyForAuto: false,
        limitation: "Current Coach's first 50 candidate practices only; historical pagination and cross-Coach access are not supported."
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
        requirePracticeVerificationAccess(actor, practice);
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
      requirePracticeVerificationAccess(actor, practice);
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
