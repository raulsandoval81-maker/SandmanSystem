import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  logger,
} from "firebase-functions";

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

      logger.info("getAthleteSkillsSummary authorization", {
        callerUid,
        athleteId,
        actorRole: actor.role,
        actorStatus: actor.status,
        athleteCoachUid: clean(athlete.coachUid),
        athleteCoachIds: normalizeStaffList(athlete.coachIds),
        athleteLocationId: clean(athlete.locationId),
      });

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

    const skills =
      snapshot.docs
        .map((docSnap) => {
          const data =
            docSnap.data() || {};

          const state =
            clean(
              data.state ||
              data.status ||
              "NOT_INTRODUCED"
            ).toUpperCase();

          return {
            familyId:
              clean(
                data.familyId ||
                docSnap.id
              ),
            name:
              clean(
                data.name ||
                data.familyId ||
                docSnap.id
              ),
            state,
          };
        })
        .filter((skill) =>
          ALLOWED_STATES.has(skill.state)
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        );

    return {
      ok: true,
      athleteId,
      skills,
    };
  });
