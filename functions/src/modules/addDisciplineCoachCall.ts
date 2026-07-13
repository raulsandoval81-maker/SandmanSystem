import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  addDisciplineToAthlete,
} from "../services/addDisciplineToAthlete";

export const addDisciplineCoachCall =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }

    const data = req.data || {};

    const existingAthleteUid =
      String(
        data.existingAthleteUid || ""
      )
        .trim()
        .toUpperCase();

    if (!existingAthleteUid) {
      throw new HttpsError(
        "invalid-argument",
        "Missing existingAthleteUid."
      );
    }

    const result =
      await addDisciplineToAthlete(
        getFirestore(),
        req.auth.uid,
        {
          existingAthleteUid,

          intakeId: null,

          foundry:
            String(data.foundry || "")
              .trim()
              .toLowerCase() as
                | "f4"
                | "f8",

          framework:
            String(
              data.framework || ""
            ).trim(),

          programTrack:
            String(
              data.programTrack || ""
            ).trim(),

          art:
            String(
              data.art ||
              data.discipline ||
              ""
            ).trim(),

          trackCode:
            String(
              data.trackCode || ""
            ).trim(),

          ladderKey:
            String(
              data.ladderKey || ""
            ).trim(),

          rosterIds:
            Array.isArray(
              data.rosterIds
            )
              ? data.rosterIds
              : [],

          coachIds:
            Array.isArray(
              data.coachIds
            )
              ? data.coachIds
              : [],

          locationId:
            String(
              data.locationId || ""
            ).trim() || null,

          placement:
            data.placement &&
            typeof data.placement ===
              "object"
              ? data.placement
              : null,
        }
      );

    return {
      ok: true,
      mode: "add_sport",
      ...result,
    };
  });
