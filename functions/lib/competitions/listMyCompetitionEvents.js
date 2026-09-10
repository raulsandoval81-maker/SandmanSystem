"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMyCompetitionEvents = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const crossTrainingPolicy_1 = require("../schedules/crossTrainingPolicy");
const db = (0, firestore_1.getFirestore)();
const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
exports.listMyCompetitionEvents = (0, https_1.onCall)(async (req) => {
    const callerUid = clean(req.auth?.uid);
    const athleteId = clean(req.data?.athleteId).toUpperCase();
    if (!callerUid)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    if (!athleteId)
        throw new https_1.HttpsError("invalid-argument", "athleteId required.");
    const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
    if (!athleteSnap.exists)
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    const athlete = athleteSnap.data() || {};
    if (clean(athlete.authUid) !== callerUid) {
        const link = await db.collection("parentAthleteLinks")
            .where("parentUid", "==", callerUid)
            .where("athleteUid", "==", athleteId)
            .where("status", "==", "active")
            .limit(1)
            .get();
        const legacyParentMatch = clean(athlete.parentUid) === callerUid;
        if (link.empty && !legacyParentMatch) {
            throw new https_1.HttpsError("permission-denied", "Competition schedule access denied.");
        }
    }
    const disciplines = new Set((0, crossTrainingPolicy_1.athleteScheduleDisciplineIds)(athlete));
    const locations = new Set([(0, crossTrainingPolicy_1.athleteHomeLocationId)(athlete)].filter(Boolean));
    const now = firestore_1.Timestamp.now();
    const assignments = await db.collection("athleteCrossTrainingAssignments").where("athleteId", "==", athleteId).where("status", "==", "active").get();
    for (const doc of assignments.docs) {
        const assignment = doc.data();
        if (assignment.activeFrom?.toMillis?.() > now.toMillis() || assignment.activeTo?.toMillis?.() < now.toMillis())
            continue;
        locations.add(clean(assignment.hostLocationId));
        list(assignment.disciplineIds).forEach((id) => disciplines.add(id === "kickboxing" ? "muay-thai" : id));
    }
    const teams = new Set(list(athlete.teamIds).concat(list(athlete.teams), clean(athlete.teamId)).filter(Boolean));
    const snapshot = await db.collection("events").where("eventType", "==", "competition").get();
    const events = snapshot.docs.map((doc) => ({ eventId: doc.id, ...doc.data() })).filter((event) => {
        if (event.visibility !== "internal" || event.publicationStatus !== "published" || event.status !== "active")
            return false;
        const programs = list(event.programScopes);
        if (!programs.some((id) => disciplines.has(id)))
            return false;
        const eventLocations = list(event.locationIds);
        const eventTeams = list(event.teamIds);
        return (!eventLocations.length || eventLocations.some((id) => locations.has(id))) && (!eventTeams.length || eventTeams.some((id) => teams.has(id)));
    }).sort((a, b) => clean(a.startDate).localeCompare(clean(b.startDate)));
    return { ok: true, athleteId, events };
});
