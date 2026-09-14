"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listManagementAttendance = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const crossTrainingPolicy_1 = require("../schedules/crossTrainingPolicy");
const clean = (value) => String(value ?? "").trim();
function millis(value) {
    if (value && typeof value.toMillis === "function")
        return value.toMillis();
    if (value && Number.isFinite(value.seconds))
        return value.seconds * 1000;
    const parsed = Date.parse(clean(value));
    return Number.isFinite(parsed) ? parsed : 0;
}
function athlete(entry) {
    return {
        id: clean(entry?.id || entry?.uid),
        name: clean(entry?.name || entry?.publicName || entry?.fullName || entry?.id || entry?.uid),
        checkedInAt: entry?.checkedInAt || null,
    };
}
exports.listManagementAttendance = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Management authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management access required.");
    const isAdmin = actor.role === "admin" || actor.role === "system_admin";
    const allowedLocations = (0, crossTrainingPolicy_1.staffLocationIds)(actor.staff);
    if (!isAdmin && !allowedLocations.length) {
        throw new https_1.HttpsError("permission-denied", "No authorized Management location is assigned.");
    }
    const db = (0, firestore_1.getFirestore)();
    const [practiceSnap, attendanceSnap] = await Promise.all([
        db.collection("practiceSessions").get(),
        db.collection("attendance_sessions").get(),
    ]);
    const practices = new Map(practiceSnap.docs.map((snap) => [snap.id, snap.data() || {}]));
    const ids = new Set([...practiceSnap.docs.map((snap) => snap.id), ...attendanceSnap.docs.map((snap) => snap.id)]);
    const attendance = new Map(attendanceSnap.docs.map((snap) => [snap.id, snap.data() || {}]));
    const sessions = [...ids].map((practiceId) => {
        const practice = practices.get(practiceId) || {};
        const record = attendance.get(practiceId) || {};
        const locationId = clean(practice.locationId || practice.academyId || record.locationId || record.academyId);
        if (!locationId || (!isAdmin && !allowedLocations.includes(locationId)))
            return null;
        const checkedIn = Array.isArray(record.checkedIn) ? record.checkedIn.map(athlete).filter((item) => item.id) : [];
        const present = Array.isArray(record.present) ? record.present.map(athlete).filter((item) => item.id) : [];
        const removedIds = Array.isArray(record.removedFromReviewIds) ? record.removedFromReviewIds.map(clean).filter(Boolean) : [];
        const status = clean(record.status || (practice.status === "active" ? "open" : practice.status || "open")).toLowerCase();
        return {
            practiceId,
            locationId,
            discipline: clean(practice.discipline || record.discipline),
            roomId: clean(practice.roomId || record.roomId),
            coach: clean(record.coach || practice.coachName || practice.coachUid),
            coachUid: clean(practice.coachUid || record.coachUid),
            openedAt: practice.openedAt || record.createdAt || null,
            submittedAt: record.submittedAt || null,
            finalizedAt: record.finalizedAt || null,
            status,
            practiceStatus: clean(practice.status),
            checkedInCount: Number(record.checkedInCount ?? checkedIn.length ?? 0),
            presentCount: Number(record.presentCount ?? present.length ?? 0),
            checkedIn,
            present,
            removedIds,
            updatedAt: record.updatedAt || practice.updatedAt || null,
            sortAt: Math.max(millis(record.finalizedAt), millis(record.submittedAt), millis(record.updatedAt), millis(practice.openedAt)),
        };
    }).filter(Boolean).sort((a, b) => b.sortAt - a.sortAt).slice(0, 100);
    return { ok: true, locationIds: isAdmin ? [] : allowedLocations, sessions };
});
