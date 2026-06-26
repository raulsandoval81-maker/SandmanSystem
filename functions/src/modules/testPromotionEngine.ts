import { onRequest } from "firebase-functions/v2/https";

import { loadAthlete } from "../engines/athlete-engine/athleteLoader";
import { evaluatePromotion } from "../engines/promotion-engine/promotionEngine";

export const testPromotionEngine = onRequest(async (req, res) => {

  try {

    const uid = String(req.query.uid || "F4_0001");

    const athlete = await loadAthlete(uid);

    const decision = evaluatePromotion(athlete);

    res.status(200).json({

      success: true,

      engine: "Sandman Promotion Engine",

      athlete,

      decision

    });

  } catch (err: any) {

    res.status(500).json({

      success: false,

      error: err.message

    });

  }

});