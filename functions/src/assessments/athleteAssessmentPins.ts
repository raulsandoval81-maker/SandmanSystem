import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore,
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  resolveAuthoritativeLifetimeCombatDiscipline
} from "../policy/lifetimeCombatDisciplinePolicy";

const db = getFirestore();

const MANAGEMENT_ROLES = new Set([
  "management",
  "manager",
  "location_manager"
]);

type StaffContext = {
  uid: string;
  role: string;
  isAdmin: boolean;
  isManagement: boolean;
  isCoach: boolean;
  locationIds: string[];
};

type AssessmentCase = {
  intakeId: string | null;
  proposalId: string | null;
  connectLeadId: string | null;
  claimedExperience: {
    priorExperience: string | null;
    range: string | null;
    notes: string | null;
    discipline: string | null;
    source: string | null;
  };
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeList(...values: unknown[]): string[] {
  const out: string[] = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = clean(item);
        if (normalized && !out.includes(normalized)) {
          out.push(normalized);
        }
      }
      continue;
    }

    const normalized = clean(value);
    if (normalized && !out.includes(normalized)) {
      out.push(normalized);
    }
  }

  return out;
}

async function requireStaff(uid: string): Promise<StaffContext> {
  const staffSnap = await db.doc(`staff/${uid}`).get();

  if (!staffSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Staff access required."
    );
  }

  const staff = staffSnap.data() || {};
  const role = clean(staff.role).toLowerCase();
  const status = clean(staff.status).toLowerCase();

  if (status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "Active staff access required."
    );
  }

  const isAdmin = role === "admin";
  const isManagement = MANAGEMENT_ROLES.has(role);
  const isCoach = role === "coach";

  if (!isAdmin && !isManagement && !isCoach) {
    throw new HttpsError(
      "permission-denied",
      "Coach, Management, or Admin access required."
    );
  }

  return {
    uid,
    role,
    isAdmin,
    isManagement,
    isCoach,
    locationIds: normalizeList(
      staff.locationIds,
      staff.locations,
      staff.locationId
    )
  };
}

function requireLocationAccess(
  staff: StaffContext,
  locationId: string
) {
  if (staff.isAdmin) return;

  if (!locationId || !staff.locationIds.includes(locationId)) {
    throw new HttpsError(
      "permission-denied",
      "This athlete is outside your assigned location."
    );
  }
}

function athleteName(
  athlete: Record<string, any>,
  athleteUid: string
): string {
  return (
    clean(athlete.publicName) ||
    clean(athlete.fullName) ||
    clean(athlete.name) ||
    athleteUid
  );
}

function recognizedXpForYears(years: number): number {
  if (years === 1) return 200;
  if (years === 2) return 400;
  if (years >= 3) return 600;
  return 0;
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return null;
}

function serializePin(
  id: string,
  data: Record<string, any>
) {
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

async function resolveAssessmentCase(
  athleteUid: string
): Promise<AssessmentCase> {
  const intakeSnap = await db
    .collection("intakes")
    .where("approvedUid", "==", athleteUid)
    .get();

  const approved = intakeSnap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() || {}
    }))
    .filter(({ data }) =>
      clean(data.mode || "new_athlete").toLowerCase() === "new_athlete" &&
      clean(data.status).toLowerCase() === "approved" &&
      data.minted === true &&
      Boolean(clean(data.proposalId))
    )
    .sort((a, b) =>
      (timestampMillis(b.data.approvedAt) ||
        timestampMillis(b.data.updatedAt) ||
        timestampMillis(b.data.createdAt) || 0) -
      (timestampMillis(a.data.approvedAt) ||
        timestampMillis(a.data.updatedAt) ||
        timestampMillis(a.data.createdAt) || 0)
    )[0];

  if (!approved) {
    return {
      intakeId: null,
      proposalId: null,
      connectLeadId: null,
      claimedExperience: {
        priorExperience: null,
        range: null,
        notes: null,
        discipline: null,
        source: null
      }
    };
  }

  const connectLeadId =
    clean(approved.data.connectLeadId) || null;

  let claimedExperience = {
    priorExperience: null as string | null,
    range: null as string | null,
    notes: null as string | null,
    discipline: null as string | null,
    source: null as string | null
  };

  if (connectLeadId) {
    const leadSnap =
      await db.doc(`interest_leads/${connectLeadId}`).get();

    if (leadSnap.exists) {
      const lead = leadSnap.data() || {};

      claimedExperience = {
        priorExperience:
          clean(lead.claimedPriorExperience).toLowerCase() || null,
        range:
          clean(lead.claimedExperienceRange).toLowerCase() || null,
        notes:
          clean(lead.claimedExperienceNotes) || null,
        discipline:
          clean(
            lead.preferredDiscipline ||
            lead.discipline ||
            approved.data.requestedDiscipline ||
            approved.data.discipline
          ).toLowerCase() || null,
        source: "interest_lead"
      };
    }
  }

  return {
    intakeId: approved.id,
    proposalId: clean(approved.data.proposalId) || null,
    connectLeadId,
    claimedExperience
  };
}

/* =====================================================
   MANAGEMENT → COACH
===================================================== */

export const createAthleteAssessmentPin = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Staff sign-in required."
    );
  }

  const staff = await requireStaff(req.auth.uid);

  if (!staff.isAdmin && !staff.isManagement) {
    throw new HttpsError(
      "permission-denied",
      "Management access required."
    );
  }

  const athleteUid = clean(req.data?.athleteUid);

  if (!athleteUid) {
    throw new HttpsError(
      "invalid-argument",
      "athleteUid is required."
    );
  }

  const athleteRef = db.doc(`athletes/${athleteUid}`);
  const athleteSnap = await athleteRef.get();

  if (!athleteSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Athlete not found."
    );
  }

  const athlete = athleteSnap.data() || {};

  let canonicalDiscipline: string;
  try {
    canonicalDiscipline = resolveAuthoritativeLifetimeCombatDiscipline({
      athlete,
      requestedDiscipline: req.data?.discipline
    });
  } catch (error: any) {
    throw new HttpsError(
      "failed-precondition",
      String(error?.message || "UNKNOWN_ASSESSMENT_DISCIPLINE")
    );
  }

  const locationId = clean(athlete.locationId);
  requireLocationAccess(staff, locationId);

  // Enrollment provenance is resolved server-side. The browser never gets
  // to choose which proposal/intake owns this Coach assessment.
  const assessmentCase = await resolveAssessmentCase(athleteUid);

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
    const activeData = active.data() || {};
    const activeDiscipline = clean(
      activeData.disciplineId || activeData.discipline
    );

    if (activeDiscipline !== canonicalDiscipline) {
      throw new HttpsError(
        "failed-precondition",
        "ACTIVE_ASSESSMENT_DISCIPLINE_MISMATCH"
      );
    }

    // Safe legacy backfill: an already-open assessment keeps the same pinId,
    // but receives authoritative case provenance when the current enrollment
    // can be resolved.
    const needsCaseBackfill =
      Boolean(
        assessmentCase.proposalId &&
        !clean(activeData.proposalId)
      );

    const needsClaimBackfill =
      Boolean(
        assessmentCase.claimedExperience.source &&
        (
          !activeData.claimedExperience ||
          typeof activeData.claimedExperience !== "object" ||
          !clean(activeData.claimedExperience.source)
        )
      );

    if (needsCaseBackfill || needsClaimBackfill) {
      await active.ref.set(
        {
          ...(needsCaseBackfill
            ? {
                proposalId: assessmentCase.proposalId,
                intakeId: assessmentCase.intakeId,
                connectLeadId: assessmentCase.connectLeadId,
                caseLinkedAt: FieldValue.serverTimestamp()
              }
            : {}),
          ...(needsClaimBackfill
            ? {
                connectLeadId: assessmentCase.connectLeadId,
                claimedExperience: assessmentCase.claimedExperience
              }
            : {}),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    return {
      ok: true,
      duplicate: true,
      pinId: active.id,
      status: activeData.status,
      proposalId:
        clean(activeData.proposalId) ||
        assessmentCase.proposalId,
      intakeId:
        clean(activeData.intakeId) ||
        assessmentCase.intakeId
    };
  }

  const pinRef = db.collection("athleteAssessmentPins").doc();
  const now = FieldValue.serverTimestamp();

  await pinRef.set({
    athleteUid,
    athleteName: athleteName(athlete, athleteUid),
    locationId,

    // Canonical case provenance. Null is allowed only for genuine legacy /
    // existing-athlete assessments that have no enrollment case.
    proposalId: assessmentCase.proposalId,
    intakeId: assessmentCase.intakeId,
    connectLeadId: assessmentCase.connectLeadId,
    claimedExperience: assessmentCase.claimedExperience,
    caseLinkedAt: assessmentCase.proposalId ? now : null,

    disciplineId: canonicalDiscipline,
    discipline: canonicalDiscipline,

    program: clean(
      athlete.programTrack ||
      athlete.journey ||
      athlete.program ||
      athlete.track
    ),

    status: "ASSESSMENT_NEEDED",

    currentEarnedXp: Math.max(
      0,
      Number(athlete.xp || 0)
    ),

    onboardingPolicy: {
      scope: "claimed_prior_experience_only",
      practice1: "half_credit_unless_validation_standard_met",
      practice2: "half_credit_unless_validation_standard_met",
      practice3Plus: "full_credit",
      halfCreditXp: 5,
      fearPassingScore: 16,
      fearMaximumScore: 20,
      acceptedShirts: ["plain_white", "academy"],
      acceptedExecution: ["clean", "smooth"],
      requiresCorrectSkills: true,
      requiresKnowHow: true
    },

    validationObservations: {},
    validationPracticeDays: [],

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

    managementNote:
      clean(req.data?.managementNote) || null,

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
    status: "ASSESSMENT_NEEDED",
    proposalId: assessmentCase.proposalId,
    intakeId: assessmentCase.intakeId
  };
});

/* =====================================================
   SHARED QUEUE
===================================================== */

export const listAthleteAssessmentPins = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Staff sign-in required."
    );
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
      if (staff.isAdmin) return true;
      return staff.locationIds.includes(clean(data.locationId));
    })
    .map(({ id, data }) => serializePin(id, data));

  return {
    ok: true,
    pins
  };
});


function requireDayKey(value: unknown): string {
  const dayKey = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);

  if (!match) {
    throw new HttpsError(
      "invalid-argument",
      "Validation observation date must use YYYY-MM-DD."
    );
  }

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );

  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Validation observation date is invalid."
    );
  }

  return dayKey;
}

function requireFearScore(value: unknown, label: string): number {
  const score = Number(value);

  if (
    !Number.isInteger(score) ||
    score < 1 ||
    score > 5
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be scored from 1 to 5.`
    );
  }

  return score;
}

export const saveAthleteValidationObservation = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Coach sign-in required."
    );
  }

  const staff = await requireStaff(req.auth.uid);

  if (!staff.isAdmin && !staff.isCoach) {
    throw new HttpsError(
      "permission-denied",
      "Coach access required."
    );
  }

  const pinId = clean(req.data?.pinId);
  const dayKey = requireDayKey(req.data?.dayKey);

  if (!pinId) {
    throw new HttpsError(
      "invalid-argument",
      "pinId is required."
    );
  }

  const pinRef = db.doc(`athleteAssessmentPins/${pinId}`);
  const pinSnap = await pinRef.get();

  if (!pinSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Assessment pin not found."
    );
  }

  const pin = pinSnap.data() || {};
  requireLocationAccess(staff, clean(pin.locationId));

  if (
    clean(pin.claimedExperience?.priorExperience).toLowerCase() !== "yes"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Validation observations apply only to athletes requesting prior-experience validation."
    );
  }

  const status = clean(pin.status).toUpperCase();

  if (
    ![
      "ASSESSMENT_NEEDED",
      "IN_ASSESSMENT",
      "RETURNED_TO_MANAGEMENT"
    ].includes(status)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This prior-experience validation is no longer active."
    );
  }

  const focus = requireFearScore(req.data?.fear?.focus, "Focus");
  const effort = requireFearScore(req.data?.fear?.effort, "Effort");
  const attitude = requireFearScore(req.data?.fear?.attitude, "Attitude");
  const respect = requireFearScore(req.data?.fear?.respect, "Respect");
  const fearTotal = focus + effort + attitude + respect;

  const shirt = clean(req.data?.shirt).toLowerCase();
  const allowedShirts = new Set([
    "plain_white",
    "academy",
    "other"
  ]);

  if (!allowedShirts.has(shirt)) {
    throw new HttpsError(
      "invalid-argument",
      "Choose Plain White, Academy Shirt, or Other."
    );
  }

  const execution = clean(req.data?.execution).toLowerCase();

  if (
    ![
      "clean",
      "smooth",
      "rigid",
      "sloppy"
    ].includes(execution)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose Clean, Smooth, Rigid, or Sloppy execution."
    );
  }

  const correctSkills = req.data?.correctSkills === true;
  const knowHow = req.data?.knowHow === true;

  const observations =
    pin.validationObservations &&
    typeof pin.validationObservations === "object"
      ? pin.validationObservations
      : {};

  const existingDays =
    Object.keys(observations)
      .filter(Boolean);

  if (
    !existingDays.includes(dayKey) &&
    existingDays.length >= 2
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Two validation observation days are already recorded."
    );
  }

  const shirtStandardMet =
    shirt === "plain_white" ||
    shirt === "academy";

  const executionStandardMet =
    execution === "clean" ||
    execution === "smooth";

  const fullCreditEligible =
    fearTotal >= 16 &&
    shirtStandardMet &&
    correctSkills &&
    knowHow &&
    executionStandardMet;

  const observation = {
    dayKey,

    fear: {
      focus,
      effort,
      attitude,
      respect,
      total: fearTotal
    },

    shirt,
    shirtStandardMet,

    correctSkills,
    knowHow,

    execution,
    executionStandardMet,

    fullCreditEligible,

    coachUid: req.auth.uid,
    savedAt: FieldValue.serverTimestamp()
  };

  await pinRef.update({
    [`validationObservations.${dayKey}`]:
      observation,

    status:
      status === "ASSESSMENT_NEEDED"
        ? "IN_ASSESSMENT"
        : status,

    updatedAt:
      FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    pinId,
    dayKey,
    fearTotal,
    fullCreditEligible
  };
});

/* =====================================================
   COACH → MANAGEMENT
===================================================== */

export const returnAthleteAssessmentPin = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Coach sign-in required."
    );
  }

  const staff = await requireStaff(req.auth.uid);

  if (!staff.isAdmin && !staff.isCoach) {
    throw new HttpsError(
      "permission-denied",
      "Coach access required."
    );
  }

  const pinId = clean(req.data?.pinId);

  if (!pinId) {
    throw new HttpsError(
      "invalid-argument",
      "pinId is required."
    );
  }

  const pinRef = db.doc(`athleteAssessmentPins/${pinId}`);
  const pinSnap = await pinRef.get();

  if (!pinSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Assessment pin not found."
    );
  }

  const pin = pinSnap.data() || {};
  requireLocationAccess(staff, clean(pin.locationId));

  const status = clean(pin.status).toUpperCase();

  if (!["ASSESSMENT_NEEDED", "IN_ASSESSMENT"].includes(status)) {
    throw new HttpsError(
      "failed-precondition",
      "This assessment is no longer open for Coach review."
    );
  }

  const fear =
    req.data?.fear && typeof req.data.fear === "object"
      ? req.data.fear
      : {};

  const allowedFear = new Set([
    "meets",
    "developing",
    "concern"
  ]);

  const normalizedFear = {
    focus: clean(fear.focus).toLowerCase(),
    effort: clean(fear.effort).toLowerCase(),
    attitude: clean(fear.attitude).toLowerCase(),
    respect: clean(fear.respect).toLowerCase()
  };

  for (const value of Object.values(normalizedFear)) {
    if (!allowedFear.has(value)) {
      throw new HttpsError(
        "invalid-argument",
        "Complete all FEAR findings before returning the assessment."
      );
    }
  }

  const experienceMode = clean(
    req.data?.experienceMode
  ).toLowerCase();

  let verifiedYears = 0;
  let recognitionXp = 0;
  let manual = false;
  let manualXp: number | null = null;

  const experienceNote = clean(req.data?.experienceNote);

  if (experienceMode === "manual") {
    manual = true;

    const requestedManualXp = Number(
      req.data?.manualExperienceXp
    );

    if (
      !Number.isFinite(requestedManualXp) ||
      requestedManualXp < 0 ||
      requestedManualXp >= 200 ||
      !Number.isInteger(requestedManualXp)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Less-than-1-year recognition must be a whole number from 0 to 199 XP."
      );
    }

    if (!experienceNote) {
      throw new HttpsError(
        "invalid-argument",
        "Manual prior-experience XP requires a Coach note."
      );
    }

    manualXp = requestedManualXp;
    recognitionXp = requestedManualXp;
  } else {
    verifiedYears = Number(
      req.data?.verifiedExperienceYears || 0
    );

    if (![0, 1, 2, 3].includes(verifiedYears)) {
      throw new HttpsError(
        "invalid-argument",
        "Verified experience must be None, 1 Year, 2 Years, or 3+ Years."
      );
    }

    recognitionXp = recognizedXpForYears(verifiedYears);
  }

  const placementRecommendation = clean(
    req.data?.placementRecommendation
  );

  if (!placementRecommendation) {
    throw new HttpsError(
      "invalid-argument",
      "Placement recommendation is required."
    );
  }

  const athleteSnap = await db
    .doc(`athletes/${clean(pin.athleteUid)}`)
    .get();

  const currentEarnedXp = athleteSnap.exists
    ? Math.max(
        0,
        Number(athleteSnap.data()?.xp || 0)
      )
    : Math.max(
        0,
        Number(pin.currentEarnedXp || 0)
      );

  await pinRef.set(
    {
      status: "RETURNED_TO_MANAGEMENT",
      currentEarnedXp,
      fear: normalizedFear,
      priorExperience: {
        verifiedYears: manual ? null : verifiedYears,
        recognitionXp,
        manual,
        manualXp,
        note: experienceNote || null
      },
      placementRecommendation,
      coachNotes: clean(req.data?.coachNotes) || null,
      coachReturnedAt: FieldValue.serverTimestamp(),
      coachReturnedBy: req.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

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

export const recordAthleteAssessmentPlacement = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Management sign-in required."
    );
  }

  const staff = await requireStaff(req.auth.uid);

  if (!staff.isAdmin && !staff.isManagement) {
    throw new HttpsError(
      "permission-denied",
      "Management access required."
    );
  }

  const pinId = clean(req.data?.pinId);

  if (!pinId) {
    throw new HttpsError(
      "invalid-argument",
      "pinId is required."
    );
  }

  const pinRef = db.doc(`athleteAssessmentPins/${pinId}`);
  const pinSnap = await pinRef.get();

  if (!pinSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Assessment pin not found."
    );
  }

  const pin = pinSnap.data() || {};
  requireLocationAccess(staff, clean(pin.locationId));

  if (clean(pin.status).toUpperCase() !== "RETURNED_TO_MANAGEMENT") {
    throw new HttpsError(
      "failed-precondition",
      "Coach assessment has not been returned yet."
    );
  }

  const finalPlacementNote = clean(
    req.data?.finalPlacementNote
  );

  await pinRef.set(
    {
      status: "PLACEMENT_RECORDED",
      finalPlacementNote: finalPlacementNote || null,
      placementRecordedAt: FieldValue.serverTimestamp(),
      placementRecordedBy: req.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    status: "PLACEMENT_RECORDED"
  };
});
