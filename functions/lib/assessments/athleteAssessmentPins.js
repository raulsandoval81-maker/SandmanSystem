"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAthleteAssessmentPlacement = exports.returnAthleteAssessmentPin = exports.listAthleteAssessmentPins = exports.createAthleteAssessmentPin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
const MANAGEMENT_ROLES = new Set([
    "management",
    "manager",
    "location_manager"
]);
function clean(value) {
    return String(value ?? "").trim();
}
function normalizeList(...values) {
    const out = [];
    for (const value of values) {
        if (Array.isArray(value)) {
            for (const item of value) {
                const normalized = clean(item);
                if (normalized &&
                    !out.includes(normalized)) {
                    out.push(normalized);
                }
            }
            continue;
        }
        const normalized = clean(value);
        if (normalized &&
            !out.includes(normalized)) {
            out.push(normalized);
        }
    }
    return out;
}
async function requireStaff(uid) {
    const staffSnap = await db.doc(`staff/${uid}`).get();
    if (!staffSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "Staff access required.");
    }
    const staff = staffSnap.data() || {};
    const role = clean(staff.role).toLowerCase();
    const status = clean(staff.status).toLowerCase();
    if (status !== "active") {
        throw new https_1.HttpsError("permission-denied", "Active staff access required.");
    }
    const isAdmin = role === "admin";
    const isManagement = MANAGEMENT_ROLES.has(role);
    const isCoach = role === "coach";
    if (!isAdmin &&
        !isManagement &&
        !isCoach) {
        throw new https_1.HttpsError("permission-denied", "Coach, Management, or Admin access required.");
    }
    return {
        uid,
        role,
        isAdmin,
        isManagement,
        isCoach,
        locationIds: normalizeList(staff.locationIds, staff.locations, staff.locationId)
    };
}
function requireLocationAccess(staff, locationId) {
    if (staff.isAdmin)
        return;
    if (!locationId ||
        !staff.locationIds.includes(locationId)) {
        throw new https_1.HttpsError("permission-denied", "This athlete is outside your assigned location.");
    }
}
function athleteName(athlete, athleteUid) {
    return (clean(athlete.publicName) ||
        clean(athlete.fullName) ||
        clean(athlete.name) ||
        athleteUid);
}
function recognizedXpForYears(years) {
    if (years === 1)
        return 200;
    if (years === 2)
        return 400;
    if (years >= 3)
        return 600;
    return 0;
}
function timestampMillis(value) {
    if (value instanceof firestore_1.Timestamp) {
        return value.toMillis();
    }
    return null;
}
function serializePin(id, data) {
    return {
        id,
        ...data,
        createdAt: timestampMillis(data.createdAt),
        updatedAt: timestampMillis(data.updatedAt),
        sentToCoachAt: timestampMillis(data.sentToCoachAt),
        coachReturnedAt: timestampMillis(data.coachReturnedAt),
        placementRecordedAt: timestampMillis(data.placementRecordedAt)
    };
}
/* =====================================================
   MANAGEMENT → COACH
===================================================== */
exports.createAthleteAssessmentPin = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Staff sign-in required.");
    }
    const staff = await requireStaff(req.auth.uid);
    if (!staff.isAdmin &&
        !staff.isManagement) {
        throw new https_1.HttpsError("permission-denied", "Management access required.");
    }
    const athleteUid = clean(req.data?.athleteUid);
    if (!athleteUid) {
        throw new https_1.HttpsError("invalid-argument", "athleteUid is required.");
    }
    const athleteRef = db.doc(`athletes/${athleteUid}`);
    const athleteSnap = await athleteRef.get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    }
    const athlete = athleteSnap.data() || {};
    const locationId = clean(athlete.locationId);
    requireLocationAccess(staff, locationId);
    const existingSnap = await db
        .collection("athleteAssessmentPins")
        .where("athleteUid", "==", athleteUid)
        .get();
    const active = existingSnap.docs.find((doc) => {
        const status = clean(doc.data().status).toUpperCase();
        return [
            "ASSESSMENT_NEEDED",
            "IN_ASSESSMENT",
            "RETURNED_TO_MANAGEMENT"
        ].includes(status);
    });
    if (active) {
        return {
            ok: true,
            duplicate: true,
            pinId: active.id,
            status: active.data().status
        };
    }
    const pinRef = db
        .collection("athleteAssessmentPins")
        .doc();
    const now = firestore_1.FieldValue.serverTimestamp();
    await pinRef.set({
        athleteUid,
        athleteName: athleteName(athlete, athleteUid),
        locationId,
        discipline: clean(athlete.primaryDiscipline ||
            athlete.discipline ||
            athlete.art ||
            athlete.sport),
        program: clean(athlete.programTrack ||
            athlete.journey ||
            athlete.program ||
            athlete.track),
        status: "ASSESSMENT_NEEDED",
        currentEarnedXp: Math.max(0, Number(athlete.xp || 0)),
        onboardingPolicy: {
            practice1: "half_credit",
            practice2: "half_credit",
            practice3Plus: "full_credit"
        },
        fear: null,
        priorExperience: {
            verifiedYears: null,
            recognitionXp: null,
            manual: false,
            manualXp: null,
            note: null
        },
        placementRecommendation: null,
        coachNotes: null,
        managementNote: clean(req.data?.managementNote) || null,
        createdAt: now,
        updatedAt: now,
        createdBy: req.auth.uid,
        sentToCoachAt: now,
        sentToCoachBy: req.auth.uid,
        coachReturnedAt: null,
        coachReturnedBy: null,
        placementRecordedAt: null,
        placementRecordedBy: null
    });
    return {
        ok: true,
        pinId: pinRef.id,
        status: "ASSESSMENT_NEEDED"
    };
});
/* =====================================================
   SHARED QUEUE
===================================================== */
exports.listAthleteAssessmentPins = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Staff sign-in required.");
    }
    const staff = await requireStaff(req.auth.uid);
    const snapshot = await db
        .collection("athleteAssessmentPins")
        .orderBy("updatedAt", "desc")
        .limit(100)
        .get();
    const pins = snapshot.docs
        .map((doc) => ({
        id: doc.id,
        data: doc.data()
    }))
        .filter(({ data }) => {
        if (staff.isAdmin) {
            return true;
        }
        return (staff.locationIds.includes(clean(data.locationId)));
    })
        .map(({ id, data }) => serializePin(id, data));
    return {
        ok: true,
        pins
    };
});
/* =====================================================
   COACH → MANAGEMENT
===================================================== */
exports.returnAthleteAssessmentPin = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Coach sign-in required.");
    }
    const staff = await requireStaff(req.auth.uid);
    if (!staff.isAdmin &&
        !staff.isCoach) {
        throw new https_1.HttpsError("permission-denied", "Coach access required.");
    }
    const pinId = clean(req.data?.pinId);
    if (!pinId) {
        throw new https_1.HttpsError("invalid-argument", "pinId is required.");
    }
    const pinRef = db.doc(`athleteAssessmentPins/${pinId}`);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) {
        throw new https_1.HttpsError("not-found", "Assessment pin not found.");
    }
    const pin = pinSnap.data() || {};
    requireLocationAccess(staff, clean(pin.locationId));
    const status = clean(pin.status)
        .toUpperCase();
    if (![
        "ASSESSMENT_NEEDED",
        "IN_ASSESSMENT"
    ].includes(status)) {
        throw new https_1.HttpsError("failed-precondition", "This assessment is no longer open for Coach review.");
    }
    const fear = req.data?.fear &&
        typeof req.data.fear === "object"
        ? req.data.fear
        : {};
    const allowedFear = new Set([
        "meets",
        "developing",
        "concern"
    ]);
    const normalizedFear = {
        focus: clean(fear.focus)
            .toLowerCase(),
        effort: clean(fear.effort)
            .toLowerCase(),
        attitude: clean(fear.attitude)
            .toLowerCase(),
        respect: clean(fear.respect)
            .toLowerCase()
    };
    for (const value of Object.values(normalizedFear)) {
        if (!allowedFear.has(value)) {
            throw new https_1.HttpsError("invalid-argument", "Complete all FEAR findings before returning the assessment.");
        }
    }
    const experienceMode = clean(req.data?.experienceMode).toLowerCase();
    let verifiedYears = 0;
    let recognitionXp = 0;
    let manual = false;
    let manualXp = null;
    const experienceNote = clean(req.data?.experienceNote);
    if (experienceMode === "manual") {
        manual = true;
        const requestedManualXp = Number(req.data?.manualExperienceXp);
        if (!Number.isFinite(requestedManualXp) ||
            requestedManualXp < 0 ||
            requestedManualXp >= 200 ||
            !Number.isInteger(requestedManualXp)) {
            throw new https_1.HttpsError("invalid-argument", "Less-than-1-year recognition must be a whole number from 0 to 199 XP.");
        }
        if (!experienceNote) {
            throw new https_1.HttpsError("invalid-argument", "Manual prior-experience XP requires a Coach note.");
        }
        manualXp =
            requestedManualXp;
        recognitionXp =
            requestedManualXp;
    }
    else {
        verifiedYears =
            Number(req.data?.verifiedExperienceYears ||
                0);
        if (![0, 1, 2, 3].includes(verifiedYears)) {
            throw new https_1.HttpsError("invalid-argument", "Verified experience must be None, 1 Year, 2 Years, or 3+ Years.");
        }
        recognitionXp =
            recognizedXpForYears(verifiedYears);
    }
    const placementRecommendation = clean(req.data
        ?.placementRecommendation);
    if (!placementRecommendation) {
        throw new https_1.HttpsError("invalid-argument", "Placement recommendation is required.");
    }
    const athleteSnap = await db
        .doc(`athletes/${clean(pin.athleteUid)}`)
        .get();
    const currentEarnedXp = athleteSnap.exists
        ? Math.max(0, Number(athleteSnap.data()?.xp ||
            0))
        : Math.max(0, Number(pin.currentEarnedXp ||
            0));
    await pinRef.set({
        status: "RETURNED_TO_MANAGEMENT",
        currentEarnedXp,
        fear: normalizedFear,
        priorExperience: {
            verifiedYears: manual
                ? null
                : verifiedYears,
            recognitionXp,
            manual,
            manualXp,
            note: experienceNote ||
                null
        },
        placementRecommendation,
        coachNotes: clean(req.data?.coachNotes) || null,
        coachReturnedAt: firestore_1.FieldValue.serverTimestamp(),
        coachReturnedBy: req.auth.uid,
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, {
        merge: true
    });
    return {
        ok: true,
        status: "RETURNED_TO_MANAGEMENT",
        currentEarnedXp,
        recognitionXp
    };
});
/* =====================================================
   MANAGEMENT CLOSES LOOP
===================================================== */
exports.recordAthleteAssessmentPlacement = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Management sign-in required.");
    }
    const staff = await requireStaff(req.auth.uid);
    if (!staff.isAdmin &&
        !staff.isManagement) {
        throw new https_1.HttpsError("permission-denied", "Management access required.");
    }
    const pinId = clean(req.data?.pinId);
    if (!pinId) {
        throw new https_1.HttpsError("invalid-argument", "pinId is required.");
    }
    const pinRef = db.doc(`athleteAssessmentPins/${pinId}`);
    const pinSnap = await pinRef.get();
    if (!pinSnap.exists) {
        throw new https_1.HttpsError("not-found", "Assessment pin not found.");
    }
    const pin = pinSnap.data() || {};
    requireLocationAccess(staff, clean(pin.locationId));
    if (clean(pin.status)
        .toUpperCase() !==
        "RETURNED_TO_MANAGEMENT") {
        throw new https_1.HttpsError("failed-precondition", "Coach assessment has not been returned yet.");
    }
    const finalPlacementNote = clean(req.data?.finalPlacementNote);
    await pinRef.set({
        status: "PLACEMENT_RECORDED",
        finalPlacementNote: finalPlacementNote ||
            null,
        placementRecordedAt: firestore_1.FieldValue.serverTimestamp(),
        placementRecordedBy: req.auth.uid,
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, {
        merge: true
    });
    return {
        ok: true,
        status: "PLACEMENT_RECORDED"
    };
});
