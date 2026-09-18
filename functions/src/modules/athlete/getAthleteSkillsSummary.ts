import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  normalizeStaffList,
  requireActiveStaff,
  staffHasLocation,
} from "../../services/staffAuthorization";

const SKILL_PROFILE_STAFF_ROLES = Object.freeze([
  "admin",
  "coach",
]);

const ALLOWED_STATES = new Set([
  "LEARNED",
  "APPLIED",
  "MASTERED",
  "REFINED",
]);

function clean(value: unknown): string {
  return String(value ?? "").trim();
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

  return "wrestling";
}

function skillDocFamilyId(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    clean(data.familyId).toLowerCase();

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  return separator > 0
    ? docId.slice(separator + 2)
    : docId;
}

export const getAthleteSkillsSummary =
  onCall(async (req) => {
    const callerUid =
      clean(req.auth?.uid);

    if (!callerUid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }

    const athleteId =
      clean(
        req.data?.athleteId ||
        req.data?.uid
      ).toUpperCase();

    const discipline =
      normalizeDiscipline(
        req.data?.discipline || "wrestling"
      );

    if (!["wrestling", "boxing", "muay-thai"].includes(
      discipline
    )) {
      throw new HttpsError(
        "invalid-argument",
        "Unsupported skills discipline."
      );
    }

    if (!athleteId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid athlete ID is required."
      );
    }

    const db = getFirestore();

    const athleteSnap =
      await db
        .doc(`athletes/${athleteId}`)
        .get();

    if (!athleteSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Athlete not found."
      );
    }

    const athlete =
      athleteSnap.data() || {};

    let hasAccess =
      clean(athlete.authUid) === callerUid
      ||
      clean(athlete.parentUid) === callerUid;

    if (!hasAccess) {
      const parentLink =
        await db
          .collection("parentAthleteLinks")
          .where("parentUid", "==", callerUid)
          .where("athleteUid", "==", athleteId)
          .where("status", "==", "active")
          .limit(1)
          .get();

      hasAccess = !parentLink.empty;
    }

    if (!hasAccess) {
      const actor =
        await requireActiveStaff(
          callerUid,
          SKILL_PROFILE_STAFF_ROLES,
          "Athlete skills access denied."
        );

      if (actor.role !== "admin") {
        const assignedCoachIds =
          normalizeStaffList(
            athlete.coachUid,
            athlete.coachIds
          );

        const directlyAssigned =
          assignedCoachIds.includes(actor.uid);

        const locationId =
          clean(athlete.locationId);

        if (
          !directlyAssigned &&
          !staffHasLocation(
            actor.staff,
            locationId
          )
        ) {
          throw new HttpsError(
            "permission-denied",
            "Athlete skills access denied."
          );
        }
      }
    }

    const snapshot =
      await db
        .collection("athletes")
        .doc(athleteId)
        .collection("skills")
        .get();

    const skillsByFamily =
      snapshot.docs.reduce((map, docSnap) => {
        const data =
          docSnap.data() || {};

        const docDiscipline =
          skillDocDiscipline(
            docSnap.id,
            data
          );

        if (docDiscipline !== discipline) {
          return map;
        }

        const familyId =
          skillDocFamilyId(
            docSnap.id,
            data
          );

        const state =
          clean(
            data.state ||
            data.status ||
            "NOT_INTRODUCED"
          ).toUpperCase();

        if (!ALLOWED_STATES.has(state)) {
          return map;
        }

        const isCanonical =
          docSnap.id ===
          `${discipline}__${familyId}`;

        const existing =
          map.get(familyId);

        if (!existing || isCanonical) {
          map.set(familyId, {
            familyId,
            name:
              clean(
                data.name ||
                data.familyId ||
                familyId
              ),
            state,
          });
        }

        return map;
      }, new Map<string, {
        familyId: string;
        name: string;
        state: string;
      }>());

    const skills =
      Array.from(skillsByFamily.values())
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        );

    return {
      ok: true,
      athleteId,
      discipline,
      skills,
    };
  });
