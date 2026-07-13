"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDisciplineCoachCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const addDisciplineToAthlete_1 = require("../services/addDisciplineToAthlete");
exports.addDisciplineCoachCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    }
    const data = req.data || {};
    const existingAthleteUid = String(data.existingAthleteUid || "")
        .trim()
        .toUpperCase();
    if (!existingAthleteUid) {
        throw new https_1.HttpsError("invalid-argument", "Missing existingAthleteUid.");
    }
    const result = await (0, addDisciplineToAthlete_1.addDisciplineToAthlete)((0, firestore_1.getFirestore)(), req.auth.uid, {
        existingAthleteUid,
        intakeId: null,
        foundry: String(data.foundry || "")
            .trim()
            .toLowerCase(),
        framework: String(data.framework || "").trim(),
        programTrack: String(data.programTrack || "").trim(),
        art: String(data.art ||
            data.discipline ||
            "").trim(),
        trackCode: String(data.trackCode || "").trim(),
        ladderKey: String(data.ladderKey || "").trim(),
        rosterIds: Array.isArray(data.rosterIds)
            ? data.rosterIds
            : [],
        coachIds: Array.isArray(data.coachIds)
            ? data.coachIds
            : [],
        locationId: String(data.locationId || "").trim() || null,
        placement: data.placement &&
            typeof data.placement ===
                "object"
            ? data.placement
            : null,
    });
    return {
        ok: true,
        mode: "add_sport",
        ...result,
    };
});
