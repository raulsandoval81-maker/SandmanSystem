"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAthleteNormalizer = void 0;
const https_1 = require("firebase-functions/v2/https");
const athleteNormalizer_1 = require("../engines/athlete-engine/athleteNormalizer");
exports.testAthleteNormalizer = (0, https_1.onRequest)((req, res) => {
    const normalized = (0, athleteNormalizer_1.normalizeAthlete)({
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
