"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAthleteProfileRead = requireAthleteProfileRead;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("./staffAuthorization");
async function requireAthleteProfileRead(auth, rawId) {
    if (!auth?.uid || auth.token.firebase?.sign_in_provider === "anonymous") {
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    }
    const athleteId = typeof rawId === "string" ? rawId.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(athleteId)) {
        throw new https_1.HttpsError("invalid-argument", "A valid athlete ID is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const snapshot = await db.collection("athletes").doc(athleteId).get();
    const athlete = snapshot.data();
    const message = "Athlete profile access denied.";
    if (!athlete)
        throw new https_1.HttpsError("permission-denied", message);
    if (athlete.authUid === auth.uid ||
        (athlete.authUid == null && athleteId === auth.uid) ||
        athlete.parentUid === auth.uid) {
        return { db, athleteId, athlete };
    }
    const parentLinks = await db.collection("parentAthleteLinks")
        .where("parentUid", "==", auth.uid)
        .where("athleteUid", "==", athleteId)
        .where("status", "==", "active").limit(1).get();
    if (!parentLinks.empty)
        return { db, athleteId, athlete };
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(auth.uid, staffAuthorization_1.OPERATIONAL_STAFF_ROLES, message);
    if (actor.role === "management") {
        (0, staffAuthorization_1.requireStaffLocation)(actor, athlete.locationId, message);
    }
    else {
        (0, staffAuthorization_1.requireCoachAthleteAccess)(actor, athlete, message);
    }
    return { db, athleteId, athlete };
}
