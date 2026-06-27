import { onRequest } from "firebase-functions/v2/https";

import { loadAthlete } from "../engines/athlete-engine/athleteLoader";

import { evaluateTesting } from "../engines/testing-engine/testingEngine";

export const testTestingEngine = onRequest(
  { cors: true },
  async (req, res) => {

    try {

      const uid =
        String(req.query.uid || "F4_0001");

      const athlete =
        await loadAthlete(uid);

      const decision =
        evaluateTesting(athlete);

      res.status(200).json({

        success: true,

        engine: "Sandman Testing Engine",

        athlete,

        decision

      });

    } catch (err: any) {

      res.status(500).json({

        success: false,

        error: err.message

      });

    }

  }
);