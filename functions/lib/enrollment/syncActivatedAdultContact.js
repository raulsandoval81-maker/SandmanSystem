"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncActivatedAdultContact = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
function cleanEmail(value) {
    return clean(value).toLowerCase();
}
/**
 * Enrollment activation creates the canonical athlete in approveAndActivate.
 * Adult-athlete contact belongs on that canonical record as well as the
 * submitted intake so Management can immediately issue self-managed access.
 *
 * This trigger is intentionally narrow: it only runs when a new-member intake
 * crosses into approved + minted and the verified intake audience is the
 * adult athlete.
 */
exports.syncActivatedAdultContact = (0, firestore_2.onDocumentUpdated)("intakes/{intakeId}", async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const beforeStatus = clean(before.status).toLowerCase();
    const afterStatus = clean(after.status).toLowerCase();
    const athleteUid = clean(after.approvedUid).toUpperCase();
    const mode = clean(after.mode || "new_athlete").toLowerCase();
    const audience = clean(after.intakeAudience ||
        (after.source === "intake-athlete-ui"
            ? "adult_athlete"
            : "")).toLowerCase();
    if (mode !== "new_athlete" ||
        audience !== "adult_athlete" ||
        afterStatus !== "approved" ||
        after.minted !== true ||
        !athleteUid ||
        (beforeStatus === "approved" &&
            clean(before.approvedUid).toUpperCase() === athleteUid)) {
        return;
    }
    const athleteEmail = cleanEmail(after.athlete?.email ||
        after.athleteEmail ||
        after.email);
    const athletePhoneDigits = clean(after.athlete?.phoneDigits ||
        after.athletePhoneDigits ||
        after.phoneDigits);
    const languagePreference = clean(after.athlete?.languagePreference ||
        after.languagePreference).toLowerCase();
    const patch = {
        intakeAudience: "adult_athlete",
        registrantRole: "adult_athlete",
        registrationRole: "adult_athlete",
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    if (athleteEmail) {
        patch.athleteEmail = athleteEmail;
        patch.email = athleteEmail;
    }
    if (athletePhoneDigits) {
        patch.athletePhoneDigits = athletePhoneDigits;
        patch.phoneDigits = athletePhoneDigits;
    }
    if (languagePreference) {
        patch.languagePreference = languagePreference;
    }
    await db.doc(`athletes/${athleteUid}`).set(patch, { merge: true });
});
