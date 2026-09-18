"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closePracticeSession = exports.getPracticeSession = exports.openPracticeSession = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const crossTrainingPolicy_1 = require("../schedules/crossTrainingPolicy");
const PRACTICE_STAFF_ROLES = staffAuthorization_1.COACH_STAFF_ROLES;
function requiredString(value, field) {
    const normalized = String(value ?? "").trim();
    if (!normalized)
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    return normalized;
}
function requirePracticeLocation(actor, locationId) {
    if (["admin", "system_admin"].includes(actor.role))
        return;
    if (!(0, crossTrainingPolicy_1.staffLocationIds)(actor.staff).includes(locationId)) {
        throw new https_1.HttpsError("permission-denied", "Practice location is outside the staff member's authorized scope.");
    }
}
exports.openPracticeSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
    const input = request.data || {};
    const liveSessionId = requiredString(input.liveSessionId, "liveSessionId");
    const roomId = requiredString(input.roomId, "roomId");
    const locationId = requiredString(input.locationId || input.academyId, "locationId");
    requirePracticeLocation(actor, locationId);
    const discipline = requiredString(input.discipline, "discipline").toLowerCase();
    const db = (0, firestore_1.getFirestore)();
    const practiceRef = db.collection("practiceSessions").doc();
    const now = firestore_1.FieldValue.serverTimestamp();
    const practice = {
        practiceId: practiceRef.id,
        liveSessionId,
        locationId,
        academyId: locationId,
        roomId,
        coachUid: actor.uid,
        coachRole: actor.role,
        status: "active",
        discipline,
        journey: String(input.journey || "").trim(),
        program: String(input.program || "").trim(),
        track: String(input.track || "").trim(),
        tier: String(input.tier || "").trim(),
        schema: String(input.schema || "").trim(),
        durationMinutes: Math.max(0, Number(input.durationMinutes || 0)),
        openedAt: now,
        updatedAt: now,
        source: "session-builder",
    };
    const batch = db.batch();
    batch.create(practiceRef, practice);
    batch.set(db.doc(`liveSessions/${liveSessionId}`), {
        practiceId: practiceRef.id,
        liveSessionId,
        locationId,
        academyId: locationId,
        roomId,
        coachUid: actor.uid,
        status: "ready",
        discipline,
        journey: practice.journey,
        updatedAt: now,
    }, { merge: true });
    await batch.commit();
    return { ok: true, practiceId: practiceRef.id, liveSessionId, status: "active" };
});
exports.getPracticeSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
    const practiceId = requiredString(request.data?.practiceId, "practiceId");
    const snap = await (0, firestore_1.getFirestore)().doc(`practiceSessions/${practiceId}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Practice not found.");
    requirePracticeLocation(actor, requiredString(snap.data()?.locationId || snap.data()?.academyId, "practice locationId"));
    return { ok: true, practiceId: snap.id, practice: snap.data() || {} };
});
exports.closePracticeSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
    const practiceId = requiredString(request.data?.practiceId, "practiceId");
    const attendanceSessionId = requiredString(request.data?.attendanceSessionId, "attendanceSessionId");
    const db = (0, firestore_1.getFirestore)();
    let idempotent = false;
    await db.runTransaction(async (tx) => {
        const ref = db.doc(`practiceSessions/${practiceId}`);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Practice not found.");
        const practice = snap.data() || {};
        requirePracticeLocation(actor, requiredString(practice.locationId || practice.academyId, "practice locationId"));
        const liveSessionId = String(practice.liveSessionId || "").trim();
        const liveRef = liveSessionId ? db.doc(`liveSessions/${liveSessionId}`) : null;
        const liveSnap = liveRef ? await tx.get(liveRef) : null;
        if (String(practice.status || "").toLowerCase() === "closed") {
            idempotent = true;
            return;
        }
        const now = firestore_1.FieldValue.serverTimestamp();
        tx.update(ref, {
            status: "closed",
            attendanceSessionId,
            closedAt: now,
            closedBy: actor.uid,
            closedByRole: actor.role,
            updatedAt: now,
        });
        if (liveRef && String(liveSnap?.data()?.practiceId || "") === practiceId) {
            tx.set(liveRef, {
                practiceId,
                status: "closed",
                closedAt: now,
                updatedAt: now,
            }, { merge: true });
        }
    });
    return { ok: true, practiceId, status: "closed", idempotent };
});
