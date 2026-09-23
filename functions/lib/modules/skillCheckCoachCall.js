"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillCheckCoachCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const staffAuthorization_1 = require("../services/staffAuthorization");
const SKILL_CHECK_STAFF_ROLES = Object.freeze([
    "admin",
    "coach",
]);
function requireSkillCheckAthleteAccess(actor, athlete) {
    if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) === "admin")
        return;
    if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) !== "coach") {
        throw new https_1.HttpsError("permission-denied", "This athlete is outside the Coach's authorized training scope.");
    }
    const assignedCoachIds = (0, staffAuthorization_1.normalizeStaffList)(athlete.coachUid, athlete.coachIds);
    const directlyAssigned = assignedCoachIds.includes(actor.uid);
    const locationId = String(athlete.locationId ?? "").trim();
    if (!directlyAssigned &&
        !(0, staffAuthorization_1.staffHasLocation)(actor.staff, locationId)) {
        throw new https_1.HttpsError("permission-denied", "This athlete is outside the Coach's authorized training scope.");
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
function clean(value) {
    return String(value ?? "").trim();
}
function normalizeFamily(value) {
    return clean(value).toLowerCase();
}
function normalizeDiscipline(value) {
    const raw = clean(value).toLowerCase();
    if (raw.includes("wrest"))
        return "wrestling";
    if (raw.includes("muay") ||
        raw.includes("kickbox")) {
        return "muay-thai";
    }
    if (raw.includes("box"))
        return "boxing";
    return raw.replace(/[\s_]+/g, "-");
}
function familiesForDiscipline(discipline) {
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
function skillDocDiscipline(docId, data) {
    const explicit = normalizeDiscipline(data.discipline);
    if (explicit)
        return explicit;
    const separator = docId.indexOf("__");
    if (separator > 0) {
        return normalizeDiscipline(docId.slice(0, separator));
    }
    // Legacy raw family documents were Wrestling-only.
    return "wrestling";
}
function skillDocFamilyId(docId, data) {
    const explicit = normalizeFamily(data.familyId);
    if (explicit)
        return explicit;
    const separator = docId.indexOf("__");
    if (separator > 0) {
        return normalizeFamily(docId.slice(separator + 2));
    }
    return normalizeFamily(docId);
}
function normalizeState(value) {
    return clean(value).toUpperCase();
}
function optionalPracticeId(value) {
    const practiceId = clean(value);
    if (!practiceId)
        return "";
    if (practiceId.length > 160 || practiceId.includes("/") || practiceId === "." || practiceId === ".."
        || /[\u0000-\u001f\u007f]/.test(practiceId)) {
        throw new https_1.HttpsError("invalid-argument", "practiceId is invalid.");
    }
    return practiceId;
}
function requirePracticeVerificationAccess(actor, practice) {
    if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) === "admin")
        return;
    const locationId = clean(practice.locationId || practice.academyId);
    if (!locationId || !(0, staffAuthorization_1.staffHasLocation)(actor.staff, locationId)) {
        throw new https_1.HttpsError("permission-denied", "Practice location is outside the Coach's authorized scope.");
    }
    if (clean(practice.coachUid) !== actor.uid) {
        throw new https_1.HttpsError("permission-denied", "Only the Coach who opened this practice may attach Skill Check evidence.");
    }
}
function attendanceIncludesAthlete(attendance, athleteId) {
    const presentIds = Array.isArray(attendance.presentIds) ? attendance.presentIds : [];
    const present = Array.isArray(attendance.present) ? attendance.present : [];
    return presentIds.some((id) => clean(id).toUpperCase() === athleteId)
        || present.some((athlete) => clean(athlete?.id || athlete?.uid).toUpperCase() === athleteId);
}
exports.skillCheckCoachCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    }
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, SKILL_CHECK_STAFF_ROLES, "Active Coach access required.");
    const data = req.data || {};
    const action = clean(data.action).toLowerCase();
    const athleteId = clean(data.athleteId || data.uid).toUpperCase();
    const discipline = normalizeDiscipline(data.discipline || "wrestling");
    if (!["wrestling", "boxing", "muay-thai"].includes(discipline)) {
        throw new https_1.HttpsError("invalid-argument", "Unsupported Skill Check discipline.");
    }
    if (!athleteId) {
        throw new https_1.HttpsError("invalid-argument", "A valid athlete ID is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const athleteSnap = await db
        .doc(`athletes/${athleteId}`)
        .get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", `Athlete not found: ${athleteId}`);
    }
    const athlete = athleteSnap.data() || {};
    requireSkillCheckAthleteAccess(actor, athlete);
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
                name: clean(athlete.publicName) ||
                    clean(athlete.fullName) ||
                    clean(athlete.name) ||
                    athleteId,
                tier: clean(athlete.tier) ||
                    clean(athlete.progressionTier),
                rankName: clean(athlete.rankName) ||
                    clean(athlete.tierName),
                journey: clean(athlete.journey) ||
                    clean(athlete.program) ||
                    clean(athlete.track),
            },
            discipline,
            skills: Array.from(snap.docs.reduce((map, docSnap) => {
                const skillData = docSnap.data() || {};
                const docDiscipline = skillDocDiscipline(docSnap.id, skillData);
                if (docDiscipline !== discipline) {
                    return map;
                }
                const familyId = skillDocFamilyId(docSnap.id, skillData);
                const isCanonical = docSnap.id ===
                    `${discipline}__${familyId}`;
                const existing = map.get(familyId);
                if (!existing || isCanonical) {
                    map.set(familyId, {
                        id: docSnap.id,
                        ...skillData,
                        familyId,
                        discipline: docDiscipline,
                    });
                }
                return map;
            }, new Map())
                .values()),
        };
    }
    if (action !== "save") {
        throw new https_1.HttpsError("invalid-argument", "Unsupported Skill Check action.");
    }
    const familyId = normalizeFamily(data.familyId);
    const allowedFamilies = familiesForDiscipline(discipline);
    if (!allowedFamilies.includes(familyId)) {
        throw new https_1.HttpsError("invalid-argument", `Unknown ${discipline} skill family.`);
    }
    const state = normalizeState(data.state);
    const practiceId = optionalPracticeId(data.practiceId);
    if (!ALLOWED_STATES.includes(state)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid development state.");
    }
    const ref = db.doc(`athletes/${athleteId}/skills/${discipline}__${familyId}`);
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
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    if (!practiceId) {
        await ref.set(record, { merge: true });
    }
    else {
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
            if (!practiceSnap.exists)
                throw new https_1.HttpsError("not-found", "Practice not found.");
            const practice = practiceSnap.data() || {};
            requirePracticeVerificationAccess(actor, practice);
            const practiceDiscipline = normalizeDiscipline(practice.discipline);
            if (practiceDiscipline !== discipline) {
                throw new https_1.HttpsError("failed-precondition", "Skill Check discipline must match the practice discipline.");
            }
            if (!attendanceSnap.exists)
                throw new https_1.HttpsError("failed-precondition", "Finalized practice attendance is required.");
            const attendance = attendanceSnap.data() || {};
            if (clean(attendance.practiceId) !== practiceId
                || clean(attendance.status).toLowerCase() !== "finalized"
                || attendance.finalized !== true
                || normalizeDiscipline(attendance.discipline) !== discipline
                || !attendanceIncludesAthlete(attendance, athleteId)) {
                throw new https_1.HttpsError("failed-precondition", "Athlete must be present in finalized attendance for this practice.");
            }
            if (!athleteSessionSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", "Finalized athlete-session memory is required.");
            }
            const athleteSession = athleteSessionSnap.data() || {};
            if (clean(athleteSession.practiceId) !== practiceId
                || clean(athleteSession.athleteId).toUpperCase() !== athleteId
                || normalizeDiscipline(athleteSession.discipline) !== discipline
                || clean(athleteSession.attendance?.status).toLowerCase() !== "present") {
                throw new https_1.HttpsError("failed-precondition", "Athlete-session memory does not match this verification.");
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
                    verifiedAt: firestore_1.FieldValue.serverTimestamp(),
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
