import { onRequest } from "firebase-functions/v2/https";

import { SAMPLE_ATHLETES } from "../engines/athlete-engine/sampleAthletes";

import { normalizeAthlete } from "../engines/athlete-engine/athleteNormalizer";

export const testAthleteNormalizer = onRequest((req, res) => {

  const normalized = normalizeAthlete({

    uid: "F4_0001",

    uidCode: "F4_0001",

    publicName: "M. Sandoval",

    fullName: "R. Maximus Sandoval",

    team: "Lompoc Academy of Wrestling",

    trackCode: "foundry4-combat",

    tier: "T1",

    stripeCount: 0,

    xp: 775,

    xpCap: 1600,

    coachUid: "uNZ2IARTpARTWzNMZpMiYC9yWrv2",

    rankName: "Warrior",

    rankColor: "blue"

  });

  res.json({

    success: true,

    engine: "Sandman Athlete Normalizer",

    athlete: normalized

  });

});