import { onRequest } from "firebase-functions/v2/https";

import { loadAthlete } from "../engines/athlete-engine/athleteLoader";

export const testAthleteLoader = onRequest(async (req, res) => {

  try {

    const uid =
      String(req.query.uid || "F4_0001");

    const athlete =
      await loadAthlete(uid);

    res.status(200).json({

      success: true,

      engine: "Sandman Athlete Loader",

      athlete

    });

  } catch (err: any) {

    res.status(500).json({

      success: false,

      error: err.message

    });

  }

});