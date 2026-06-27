import { onRequest } from "firebase-functions/v2/https";

import { loadAthlete } from "../engines/athlete-engine/athleteLoader";
import { generateCertificateFromAthlete } from "../engines/certificate-engine/generateFromAthlete";

export const testCertificatePayloadEngine = onRequest(
  { cors: true },
  async (req, res) => {

    try {

      const uid = String(req.query.uid || "F4_0001");

      const athlete = await loadAthlete(uid);

      const payload = generateCertificateFromAthlete(athlete);

      res.status(200).json({

        success: true,

        engine: "Sandman Certificate Payload Engine",

        athlete,

        payload

      });

    } catch (err: any) {

      res.status(500).json({

        success: false,

        error: err.message

      });

    }

  }
);