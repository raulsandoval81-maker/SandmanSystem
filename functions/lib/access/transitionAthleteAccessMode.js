"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitionAthleteAccessMode = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const accessInvitationPolicy_1 = require("./accessInvitationPolicy");
const db = (0, firestore_1.getFirestore)();
exports.transitionAthleteAccessMode = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management access required.");
    const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
    const targetMode = String(req.data?.targetMode || "").trim().toLowerCase();
    if (!athleteUid)
        throw new https_1.HttpsError("invalid-argument", "Athlete ID required.");
    return db.runTransaction(async (tx) => {
        const athleteRef = db.doc(`athletes/${athleteUid}`);
        const athleteSnap = await tx.get(athleteRef);
        if (!athleteSnap.exists)
            throw new https_1.HttpsError("not-found", "Athlete not found.");
        const athlete = athleteSnap.data() || {};
        let decision;
        try {
            decision = (0, accessInvitationPolicy_1.assertAthleteAccessTransition)({
                currentMode: athlete.access?.mode,
                targetMode,
                existingAuthUid: athlete.authUid,
            });
        }
        catch (error) {
            const reason = String(error?.message || "");
            if (reason === "DIRECT_ACCESS_NOT_ACTIVE") {
                throw new https_1.HttpsError("failed-precondition", "Athlete direct access is not active.");
            }
            throw new https_1.HttpsError("failed-precondition", "Only active hybrid access may transition to self-managed.");
        }
        if (!decision.already)
            tx.update(athleteRef, { "access.mode": decision.targetMode });
        return { ok: true, athleteUid, accessMode: decision.targetMode, already: decision.already };
    });
});
