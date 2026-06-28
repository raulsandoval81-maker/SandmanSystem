"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAthleteLoader = void 0;
const https_1 = require("firebase-functions/v2/https");
const athleteLoader_1 = require("../engines/athlete-engine/athleteLoader");
exports.testAthleteLoader = (0, https_1.onRequest)(async (req, res) => {
    try {
        const uid = String(req.query.uid || "F4_0001");
        const athlete = await (0, athleteLoader_1.loadAthlete)(uid);
        res.status(200).json({
            success: true,
            engine: "Sandman Athlete Loader",
            athlete
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
