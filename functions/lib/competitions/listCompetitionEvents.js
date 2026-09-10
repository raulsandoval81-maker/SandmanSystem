"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCompetitionEvents = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const competitionPolicy_1 = require("./competitionPolicy");
const db = (0, firestore_1.getFirestore)();
exports.listCompetitionEvents = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.OPERATIONAL_STAFF_ROLES, "Active staff access required.");
    const discipline = (0, competitionPolicy_1.normalizeCompetitionDiscipline)(req.data?.disciplineId);
    const snap = await db.collection("events").where("eventType", "==", "competition").get();
    const events = snap.docs
        .map((doc) => ({ eventId: doc.id, ...doc.data() }))
        .filter((event) => event.visibility === "internal")
        .filter((event) => !discipline || event.disciplineId === discipline || (Array.isArray(event.programScopes) && event.programScopes.includes(discipline)))
        .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")) || String(a.name || "").localeCompare(String(b.name || "")));
    return { ok: true, events };
});
