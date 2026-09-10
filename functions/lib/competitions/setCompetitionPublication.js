"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCompetitionPublication = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const competitionPolicy_1 = require("./competitionPolicy");
const db = (0, firestore_1.getFirestore)();
exports.setCompetitionPublication = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.OPERATIONAL_STAFF_ROLES, "Active Coach, Management, or Admin access required.");
    const auditRole = (0, competitionPolicy_1.competitionAuditRole)(actor.role);
    const eventId = String(req.data?.eventId || "").trim();
    const seasonYear = Number(req.data?.seasonYear);
    const programScope = String(req.data?.programScope || "").trim().toLowerCase();
    const publicationStatus = String(req.data?.publicationStatus || "").trim().toLowerCase();
    const singleEvent = /^[a-z0-9][a-z0-9-]{2,159}$/.test(eventId);
    if (!singleEvent && (!Number.isInteger(seasonYear) || !programScope))
        throw new https_1.HttpsError("invalid-argument", "eventId or seasonYear/programScope required.");
    if (!['draft', 'published'].includes(publicationStatus))
        throw new https_1.HttpsError("invalid-argument", "publicationStatus must be draft or published.");
    const snapshots = singleEvent
        ? [await db.doc(`events/${eventId}`).get()]
        : (await db.collection("events").where("eventType", "==", "competition").get()).docs.filter((doc) => {
            const data = doc.data();
            return Number(data.seasonYear) === seasonYear && Array.isArray(data.programScopes) && data.programScopes.includes(programScope) && data.status === "active";
        });
    if (!snapshots.length || snapshots.some((snap) => !snap.exists || snap.data()?.eventType !== "competition"))
        throw new https_1.HttpsError("not-found", "Competition schedule not found.");
    if (snapshots.length > 450)
        throw new https_1.HttpsError("resource-exhausted", "Competition schedule is too large for one publication action.");
    const batch = db.batch();
    for (const snap of snapshots)
        batch.update(snap.ref, {
            publicationStatus,
            publishedAt: publicationStatus === "published" ? firestore_1.FieldValue.serverTimestamp() : null,
            publishedBy: publicationStatus === "published" ? actor.uid : null,
            publishedByRole: publicationStatus === "published" ? auditRole : null,
            updatedBy: actor.uid,
            updatedByRole: auditRole,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    await batch.commit();
    return { ok: true, eventId: singleEvent ? eventId : null, seasonYear: singleEvent ? null : seasonYear, programScope: singleEvent ? null : programScope, publicationStatus, updatedCount: snapshots.length };
});
