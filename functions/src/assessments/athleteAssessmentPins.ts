import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore,
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

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

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeList(...values: unknown[]): string[] {
  const out: string[] = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = clean(item);

        if (
          normalized &&
          !out.includes(normalized)
        ) {
          out.push(normalized);
        }
      }

      continue;
    }

    const normalized = clean(value);

    if (
      normalized &&
      !out.includes(normalized)
    ) {
      out.push(normalized);
    }
  }

  return out;
}

async function requireStaff(
  uid: string
): Promise<StaffContext> {
  const staffSnap =
    await db.doc(`staff/${uid}`).get();

  if (!staffSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Staff access required."
    );
  }

  const staff =
    staffSnap.data() || {};

  const role =
    clean(staff.role).toLowerCase();

  const status =
    clean(staff.status).toLowerCase();

  if (status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "Active staff access required."
    );
  }

  const isAdmin =
    role === "admin";

  const isManagement =
    MANAGEMENT_ROLES.has(role);

  const isCoach =
    role === "coach";

  if (
    !isAdmin &&
    !isManagement &&
    !isCoach
  ) {
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

    locationIds:
      normalizeList(
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

  if (
    !locationId ||
    !staff.locationIds.includes(locationId)
  ) {
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

function recognizedXpForYears(
  years: number
): number {
  if (years === 1) return 200;
  if (years === 2) return 400;
  if (years >= 3) return 600;
  return 0;
}

function timestampMillis(
  value: unknown
): number | null {
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

    createdAt:
      timestampMillis(data.createdAt),

    updatedAt:
      timestampMillis(data.updatedAt),

    sentToCoachAt:
      timestampMillis(data.sentToCoachAt),

    coachReturnedAt:
      timestampMillis(data.coachReturnedAt),

    placementRecordedAt:
      timestampMillis(
        data.placementRecordedAt
      )
  };
}

/* =====================================================
   MANAGEMENT → COACH
===================================================== */

export const createAthleteAssessmentPin =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Staff sign-in required."
      );
    }

    const staff =
      await requireStaff(req.auth.uid);

    if (
      !staff.isAdmin &&
      !staff.isManagement
    ) {
      throw new HttpsError(
        "permission-denied",
        "Management access required."
      );
    }

    const athleteUid =
      clean(req.data?.athleteUid);

    if (!athleteUid) {
      throw new HttpsError(
        "invalid-argument",
        "athleteUid is required."
      );
    }

    const athleteRef =
      db.doc(`athletes/${athleteUid}`);

    const athleteSnap =
      await athleteRef.get();

    if (!athleteSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Athlete not found."
      );
    }

    const athlete =
      athleteSnap.data() || {};

    const locationId =
      clean(athlete.locationId);

    requireLocationAccess(
      staff,
      locationId
    );

    const existingSnap =
      await db
        .collection("athleteAssessmentPins")
        .where(
          "athleteUid",
          "==",
          athleteUid
        )
        .get();

    const active =
      existingSnap.docs.find((doc) => {
        const status =
          clean(
            doc.data().status
          ).toUpperCase();

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
        status:
          active.data().status
      };
    }

    const pinRef =
      db
        .collection(
          "athleteAssessmentPins"
        )
        .doc();

    const now =
      FieldValue.serverTimestamp();

    await pinRef.set({
      athleteUid,

      athleteName:
        athleteName(
          athlete,
          athleteUid
        ),

      locationId,

      discipline:
        clean(
          athlete.primaryDiscipline ||
          athlete.discipline ||
          athlete.art ||
          athlete.sport
        ),

      program:
        clean(
          athlete.programTrack ||
          athlete.journey ||
          athlete.program ||
          athlete.track
        ),

      status:
        "ASSESSMENT_NEEDED",

      currentEarnedXp:
        Math.max(
          0,
          Number(athlete.xp || 0)
        ),

      onboardingPolicy: {
        practice1:
          "half_credit",

        practice2:
          "half_credit",

        practice3Plus:
          "full_credit"
      },

      fear: null,

      priorExperience: {
        verifiedYears: null,
        recognitionXp: null,
        manual: false,
        manualXp: null,
        note: null
      },

      placementRecommendation:
        null,

      coachNotes:
        null,

      managementNote:
        clean(
          req.data?.managementNote
        ) || null,

      createdAt: now,
      updatedAt: now,

      createdBy:
        req.auth.uid,

      sentToCoachAt: now,
      sentToCoachBy:
        req.auth.uid,

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

export const listAthleteAssessmentPins =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Staff sign-in required."
      );
    }

    const staff =
      await requireStaff(req.auth.uid);

    const snapshot =
      await db
        .collection(
          "athleteAssessmentPins"
        )
        .orderBy(
          "updatedAt",
          "desc"
        )
        .limit(100)
        .get();

    const pins =
      snapshot.docs
        .map((doc) => ({
          id: doc.id,
          data: doc.data()
        }))
        .filter(({ data }) => {
          if (staff.isAdmin) {
            return true;
          }

          return (
            staff.locationIds.includes(
              clean(data.locationId)
            )
          );
        })
        .map(({ id, data }) =>
          serializePin(id, data)
        );

    return {
      ok: true,
      pins
    };
  });

/* =====================================================
   COACH → MANAGEMENT
===================================================== */

export const returnAthleteAssessmentPin =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Coach sign-in required."
      );
    }

    const staff =
      await requireStaff(req.auth.uid);

    if (
      !staff.isAdmin &&
      !staff.isCoach
    ) {
      throw new HttpsError(
        "permission-denied",
        "Coach access required."
      );
    }

    const pinId =
      clean(req.data?.pinId);

    if (!pinId) {
      throw new HttpsError(
        "invalid-argument",
        "pinId is required."
      );
    }

    const pinRef =
      db.doc(
        `athleteAssessmentPins/${pinId}`
      );

    const pinSnap =
      await pinRef.get();

    if (!pinSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Assessment pin not found."
      );
    }

    const pin =
      pinSnap.data() || {};

    requireLocationAccess(
      staff,
      clean(pin.locationId)
    );

    const status =
      clean(pin.status)
        .toUpperCase();

    if (
      ![
        "ASSESSMENT_NEEDED",
        "IN_ASSESSMENT"
      ].includes(status)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This assessment is no longer open for Coach review."
      );
    }

    const fear =
      req.data?.fear &&
      typeof req.data.fear === "object"
        ? req.data.fear
        : {};

    const allowedFear =
      new Set([
        "meets",
        "developing",
        "concern"
      ]);

    const normalizedFear = {
      focus:
        clean(fear.focus)
          .toLowerCase(),

      effort:
        clean(fear.effort)
          .toLowerCase(),

      attitude:
        clean(fear.attitude)
          .toLowerCase(),

      respect:
        clean(fear.respect)
          .toLowerCase()
    };

    for (
      const value of
      Object.values(normalizedFear)
    ) {
      if (!allowedFear.has(value)) {
        throw new HttpsError(
          "invalid-argument",
          "Complete all FEAR findings before returning the assessment."
        );
      }
    }

    const experienceMode =
      clean(
        req.data?.experienceMode
      ).toLowerCase();

    let verifiedYears = 0;
    let recognitionXp = 0;
    let manual = false;
    let manualXp: number | null = null;

    const experienceNote =
      clean(
        req.data?.experienceNote
      );

    if (
      experienceMode === "manual"
    ) {
      manual = true;

      const requestedManualXp =
        Number(
          req.data?.manualExperienceXp
        );

      if (
        !Number.isFinite(
          requestedManualXp
        ) ||
        requestedManualXp < 0 ||
        !Number.isInteger(
          requestedManualXp
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Manual prior-experience XP must be a whole number."
        );
      }

      if (!experienceNote) {
        throw new HttpsError(
          "invalid-argument",
          "Manual prior-experience XP requires a Coach note."
        );
      }

      manualXp =
        requestedManualXp;

      recognitionXp =
        requestedManualXp;
    } else {
      verifiedYears =
        Number(
          req.data?.verifiedExperienceYears ||
          0
        );

      if (
        ![0, 1, 2, 3].includes(
          verifiedYears
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Verified experience must be None, 1 Year, 2 Years, or 3+ Years."
        );
      }

      recognitionXp =
        recognizedXpForYears(
          verifiedYears
        );
    }

    const placementRecommendation =
      clean(
        req.data
          ?.placementRecommendation
      );

    if (!placementRecommendation) {
      throw new HttpsError(
        "invalid-argument",
        "Placement recommendation is required."
      );
    }

    const athleteSnap =
      await db
        .doc(
          `athletes/${clean(
            pin.athleteUid
          )}`
        )
        .get();

    const currentEarnedXp =
      athleteSnap.exists
        ? Math.max(
            0,
            Number(
              athleteSnap.data()?.xp ||
              0
            )
          )
        : Math.max(
            0,
            Number(
              pin.currentEarnedXp ||
              0
            )
          );

    await pinRef.set(
      {
        status:
          "RETURNED_TO_MANAGEMENT",

        currentEarnedXp,

        fear:
          normalizedFear,

        priorExperience: {
          verifiedYears:
            manual
              ? null
              : verifiedYears,

          recognitionXp,

          manual,

          manualXp,

          note:
            experienceNote ||
            null
        },

        placementRecommendation,

        coachNotes:
          clean(
            req.data?.coachNotes
          ) || null,

        coachReturnedAt:
          FieldValue.serverTimestamp(),

        coachReturnedBy:
          req.auth.uid,

        updatedAt:
          FieldValue.serverTimestamp()
      },
      {
        merge: true
      }
    );

    return {
      ok: true,

      status:
        "RETURNED_TO_MANAGEMENT",

      currentEarnedXp,

      recognitionXp
    };
  });

/* =====================================================
   MANAGEMENT CLOSES LOOP
===================================================== */

export const recordAthleteAssessmentPlacement =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Management sign-in required."
      );
    }

    const staff =
      await requireStaff(req.auth.uid);

    if (
      !staff.isAdmin &&
      !staff.isManagement
    ) {
      throw new HttpsError(
        "permission-denied",
        "Management access required."
      );
    }

    const pinId =
      clean(req.data?.pinId);

    if (!pinId) {
      throw new HttpsError(
        "invalid-argument",
        "pinId is required."
      );
    }

    const pinRef =
      db.doc(
        `athleteAssessmentPins/${pinId}`
      );

    const pinSnap =
      await pinRef.get();

    if (!pinSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Assessment pin not found."
      );
    }

    const pin =
      pinSnap.data() || {};

    requireLocationAccess(
      staff,
      clean(pin.locationId)
    );

    if (
      clean(pin.status)
        .toUpperCase() !==
      "RETURNED_TO_MANAGEMENT"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Coach assessment has not been returned yet."
      );
    }

    const finalPlacementNote =
      clean(
        req.data?.finalPlacementNote
      );

    await pinRef.set(
      {
        status:
          "PLACEMENT_RECORDED",

        finalPlacementNote:
          finalPlacementNote ||
          null,

        placementRecordedAt:
          FieldValue.serverTimestamp(),

        placementRecordedBy:
          req.auth.uid,

        updatedAt:
          FieldValue.serverTimestamp()
      },
      {
        merge: true
      }
    );

    return {
      ok: true,
      status:
        "PLACEMENT_RECORDED"
    };
  });
