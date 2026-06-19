"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTournamentPing = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const createParentSignal_1 = require("./createParentSignal");
const ALLOWED_TYPES = new Set([
    "TOURNAMENT_ADDED",
    "WEIGH_IN_REMINDER",
    "TOURNAMENT_TOMORROW",
    "BRACKET_POSTED",
    "RESULT_POSTED",
]);
function mapTournamentSignalType(type) {
    if (type === "TOURNAMENT_ADDED")
        return createParentSignal_1.PARENT_SIGNAL_TYPES.TOURNAMENT_POSTED;
    if (type === "TOURNAMENT_TOMORROW")
        return createParentSignal_1.PARENT_SIGNAL_TYPES.TOURNAMENT_REMINDER;
    if (type === "RESULT_POSTED")
        return createParentSignal_1.PARENT_SIGNAL_TYPES.TOURNAMENT_RESULTS_POSTED;
    if (type === "BRACKET_POSTED")
        return createParentSignal_1.PARENT_SIGNAL_TYPES.TOURNAMENT_UPDATED;
    if (type === "WEIGH_IN_REMINDER")
        return createParentSignal_1.PARENT_SIGNAL_TYPES.TOURNAMENT_REMINDER;
    return createParentSignal_1.PARENT_SIGNAL_TYPES.TOURNAMENT_UPDATED;
}
exports.sendTournamentPing = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Coach authentication required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const type = String(req.data?.type || "").trim();
    const athleteId = String(req.data?.athleteId || "").trim().toUpperCase();
    const tournamentId = String(req.data?.tournamentId || "").trim();
    const eventName = String(req.data?.eventName || "").trim();
    if (!ALLOWED_TYPES.has(type)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid tournament ping type.");
    }
    if (!athleteId) {
        throw new https_1.HttpsError("invalid-argument", "Missing athleteId.");
    }
    if (!eventName) {
        throw new https_1.HttpsError("invalid-argument", "Missing eventName.");
    }
    const athleteSnap = await db.collection("athletes").doc(athleteId).get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    }
    const athlete = athleteSnap.data() || {};
    const athleteName = String(athlete.publicName ||
        athlete.fullName ||
        athleteId);
    const signalType = mapTournamentSignalType(type);
    const result = await (0, createParentSignal_1.createParentSignal)({
        athleteId,
        athleteName,
        type: signalType,
        source: "tournament",
        sourceId: tournamentId || eventName,
        tournamentId: tournamentId || undefined,
        tournamentTitle: eventName,
        note: eventName,
        meta: {
            tournamentId: tournamentId || null,
            eventName,
            originalType: type,
        },
    });
    return {
        ok: result.ok,
        sent: result.sent || 0,
        athleteId,
        type,
        signalType,
        eventName,
        tournamentId: tournamentId || null,
        reason: result.reason || null,
    };
});
