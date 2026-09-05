"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cornermanRoster = void 0;
exports.normalizeCornermanRosterAthlete = normalizeCornermanRosterAthlete;
const crypto_1 = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
function clean(value) { return String(value ?? "").trim(); }
function sameSecret(supplied, expected) {
    return (0, crypto_1.timingSafeEqual)((0, crypto_1.createHash)("sha256").update(supplied).digest(), (0, crypto_1.createHash)("sha256").update(expected).digest());
}
function normalizeCornermanRosterAthlete(id, data) {
    const sourceAthleteId = clean(data.uid || data.athleteId || id);
    const sourceTeamId = clean(data.teamId || data.locationId);
    const displayName = clean(data.publicName || data.fullName || data.name || [data.first, data.last].filter(Boolean).join(" "));
    if (!sourceAthleteId || !sourceTeamId || !displayName)
        return null;
    return {
        sourceSystem: "sandman", sourceAthleteId, sourceTeamId, displayName,
        status: clean(data.rosterStatus || data.status || "current").toLowerCase(),
        discipline: clean(data.primaryDiscipline || data.discipline || data.art || data.program),
        teamName: clean(data.team || data.location?.team)
    };
}
exports.cornermanRoster = (0, https_1.onRequest)(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET") {
        response.status(405).json({ error: "Method not allowed." });
        return;
    }
    const expected = clean(process.env.SANDMAN_CORNERMAN_SHARED_SECRET);
    const supplied = clean(request.headers.authorization).replace(/^Bearer\s+/i, "");
    if (!expected || !supplied || !sameSecret(supplied, expected)) {
        response.status(401).json({ error: "Authentication required." });
        return;
    }
    const sourceTeamId = clean(request.query.teamId);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceTeamId)) {
        response.status(400).json({ error: "A valid teamId is required." });
        return;
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        const [teamMatches, locationMatches] = await Promise.all([
            db.collection("athletes").where("teamId", "==", sourceTeamId).limit(500).get(),
            db.collection("athletes").where("locationId", "==", sourceTeamId).limit(500).get()
        ]);
        const unique = new Map();
        for (const snap of [teamMatches, locationMatches])
            for (const doc of snap.docs) {
                const athlete = normalizeCornermanRosterAthlete(doc.id, doc.data());
                if (athlete && athlete.status !== "archived" && athlete.status !== "inactive")
                    unique.set(athlete.sourceAthleteId, athlete);
            }
        response.status(200).json({ sourceSystem: "sandman", sourceTeamId, athletes: [...unique.values()] });
    }
    catch {
        response.status(503).json({ error: "Roster service is unavailable." });
    }
});
