"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessSetupStatus = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
function normalizeEmail(value) {
    return clean(value).toLowerCase();
}
function millis(value) {
    return value?.toMillis?.() || 0;
}
exports.getAccessSetupStatus = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Management sign-in required.");
    }
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management access required.");
    const requested = Array.isArray(req.data?.athleteUids)
        ? req.data.athleteUids
        : [];
    const athleteUids = [...new Set(requested
            .map((value) => clean(value).toUpperCase())
            .filter((value) => Boolean(value)))].slice(0, 10);
    if (!athleteUids.length) {
        return { ok: true, statuses: {} };
    }
    const statuses = {};
    for (const athleteUid of athleteUids) {
        const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();
        if (!athleteSnap.exists)
            continue;
        const athlete = athleteSnap.data() || {};
        (0, staffAuthorization_1.requireStaffLocation)(actor, athlete.locationId, "This athlete is outside your Management location scope.");
        const parentEmail = normalizeEmail(athlete.parentEmail);
        const [linksSnap, invitesSnap] = await Promise.all([
            db.collection("parentAthleteLinks")
                .where("athleteUid", "==", athleteUid)
                .get(),
            db.collection("accessInvitations")
                .where("athleteUid", "==", athleteUid)
                .get()
        ]);
        const parentLink = linksSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .find((link) => normalizeEmail(link.parentEmail) === parentEmail &&
            ["pending", "active"].includes(clean(link.status).toLowerCase()));
        const invitations = invitesSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }));
        function latestInvite(role) {
            return invitations
                .filter((invite) => clean(invite.role).toLowerCase() === role)
                .sort((a, b) => Math.max(millis(b.createdAt), millis(b.deliveredAt)) -
                Math.max(millis(a.createdAt), millis(a.deliveredAt)))[0] || null;
        }
        const parentInvite = latestInvite("parent");
        const athleteInvite = latestInvite("athlete");
        const parentStatus = clean(parentLink?.status).toLowerCase() === "active"
            ? "active"
            : parentInvite?.used === true
                ? "active"
                : clean(parentInvite?.deliveryStatus).toUpperCase() === "SENT"
                    ? "sent"
                    : parentInvite
                        ? "invitation_created"
                        : "not_started";
        const athleteStatus = clean(athlete.authUid)
            ? "active"
            : athleteInvite?.used === true
                ? "active"
                : clean(athleteInvite?.deliveryStatus).toUpperCase() === "SENT"
                    ? "sent"
                    : athleteInvite
                        ? "invitation_created"
                        : "not_started";
        statuses[athleteUid] = {
            parentStatus,
            athleteStatus
        };
    }
    return {
        ok: true,
        statuses
    };
});
