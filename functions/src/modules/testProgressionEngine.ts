import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";

import { normalizeAthlete } from "../engines/athlete-engine/athleteNormalizer";
import { evaluateProgression } from "../engines/progression-engine/progressionEngine";
import {
  COACH_STAFF_ROLES,
  requireActiveStaff,
  requireCoachAthleteAccessById,
} from "../services/staffAuthorization";

export const testProgressionEngine = onRequest(
  { cors: true },
  async (req, res) => {

    try {

      const bearer = String(req.headers.authorization || "")
        .replace(/^Bearer\s+/i, "")
        .trim();

      if (!bearer) {
        res.status(401).json({ success: false, error: "Authentication required." });
        return;
      }

      let callerUid = "";

      try {
        callerUid = (await getAuth().verifyIdToken(bearer)).uid;
      } catch {
        res.status(401).json({ success: false, error: "Invalid authentication token." });
        return;
      }

      const actor = await requireActiveStaff(
        callerUid,
        COACH_STAFF_ROLES,
        "Active Coach or Admin access required."
      );

      const uid = String(req.query.uid || "F4_0001");

      const athleteRecord = await requireCoachAthleteAccessById(
        actor,
        uid,
        "This athlete is outside the Coach's authorized training scope."
      );

      const athlete = normalizeAthlete({ ...athleteRecord, uid });

      const decision = evaluateProgression(athlete);

      res.status(200).json({

        success: true,

        engine: "Sandman Progression Engine",

        athlete,

        decision

      });

    } catch (err: any) {

      const code = String(err?.code || "");

      if (code === "permission-denied") {
        res.status(403).json({ success: false, error: "Access denied." });
        return;
      }

      if (code === "not-found") {
        res.status(404).json({ success: false, error: "Athlete not found." });
        return;
      }

      res.status(500).json({

        success: false,

        error: err.message

      });

    }

  }
);
