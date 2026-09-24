"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testProgressionEngine = void 0;
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const athleteNormalizer_1 = require("../engines/athlete-engine/athleteNormalizer");
const progressionEngine_1 = require("../engines/progression-engine/progressionEngine");
const staffAuthorization_1 = require("../services/staffAuthorization");
exports.testProgressionEngine = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
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
            callerUid = (await (0, auth_1.getAuth)().verifyIdToken(bearer)).uid;
        }
        catch {
            res.status(401).json({ success: false, error: "Invalid authentication token." });
            return;
        }
        const actor = await (0, staffAuthorization_1.requireActiveStaff)(callerUid, staffAuthorization_1.COACH_STAFF_ROLES, "Active Coach or Admin access required.");
        const uid = String(req.query.uid || "F4_0001");
        const athleteRecord = await (0, staffAuthorization_1.requireCoachAthleteAccessById)(actor, uid, "This athlete is outside the Coach's authorized training scope.");
        const athlete = (0, athleteNormalizer_1.normalizeAthlete)({ ...athleteRecord, uid });
        const decision = (0, progressionEngine_1.evaluateProgression)(athlete);
        res.status(200).json({
            success: true,
            engine: "Sandman Progression Engine",
            athlete,
            decision
        });
    }
    catch (err) {
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
});
