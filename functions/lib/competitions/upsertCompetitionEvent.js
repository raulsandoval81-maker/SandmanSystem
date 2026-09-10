"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertCompetitionEvent = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const competitionPolicy_1 = require("./competitionPolicy");
const db = (0, firestore_1.getFirestore)();
function timestamp(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new https_1.HttpsError("invalid-argument", "Invalid competition date/time.");
    return firestore_1.Timestamp.fromDate(date);
}
exports.upsertCompetitionEvent = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const owner = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.OPERATIONAL_STAFF_ROLES, "Active Coach, Management, or Admin access required.");
    const auditRole = (0, competitionPolicy_1.competitionAuditRole)(owner.role);
    let event;
    try {
        event = (0, competitionPolicy_1.normalizeCompetitionEvent)(req.data || {});
    }
    catch (error) {
        throw new https_1.HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid competition event.");
    }
    if (!/^[a-z0-9][a-z0-9-]{2,159}$/.test(event.eventId))
        throw new https_1.HttpsError("invalid-argument", "Invalid eventId.");
    const ref = db.doc(`events/${event.eventId}`);
    let savedPublicationStatus = "draft";
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const existing = snap.data() || {};
        if (!snap.exists && event.eventId !== (0, competitionPolicy_1.competitionEventId)(event.name, event.startDate)) {
            throw new https_1.HttpsError("invalid-argument", "New competition eventId must use the canonical name/date identity.");
        }
        if (snap.exists && existing.eventType && existing.eventType !== "competition") {
            throw new https_1.HttpsError("failed-precondition", "This eventId belongs to another event type.");
        }
        // Saving event details never publishes them. Existing publication state is
        // preserved; new records are always drafts until the explicit publish call.
        const publicationStatus = snap.exists ? String(existing.publicationStatus || "draft") : "draft";
        savedPublicationStatus = publicationStatus;
        tx.set(ref, {
            ...event,
            publicationStatus,
            publishedAt: existing.publishedAt || null,
            publishedBy: existing.publishedBy || null,
            publishedByRole: existing.publishedByRole || null,
            startAt: event.timePrecision === "datetime" ? timestamp(event.startAt) : null,
            endAt: event.timePrecision === "datetime" ? timestamp(event.endAt) : null,
            createdBy: existing.createdBy || owner.uid,
            createdByRole: existing.createdByRole || auditRole,
            createdAt: existing.createdAt || firestore_1.FieldValue.serverTimestamp(),
            updatedBy: owner.uid,
            updatedByRole: auditRole,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    return { ok: true, eventId: event.eventId, status: event.status, publicationStatus: savedPublicationStatus };
});
