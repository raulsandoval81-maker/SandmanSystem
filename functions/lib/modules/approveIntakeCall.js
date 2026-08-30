"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveIntakeCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const sendParentWelcomeEmail_1 = require("./sendParentWelcomeEmail");
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp();
}
exports.approveIntakeCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Sign-in required");
    }
    const db = (0, firestore_1.getFirestore)();
    const staffSnap = await db
        .collection("staff")
        .doc(req.auth.uid)
        .get();
    const staff = staffSnap.exists
        ? staffSnap.data() || {}
        : {};
    const role = String(staff.role || "")
        .trim()
        .toLowerCase();
    const status = String(staff.status || "")
        .trim()
        .toLowerCase();
    const allowedRoles = [
        "admin",
        "management",
        "manager",
        "location_manager",
    ];
    if (status !== "active" ||
        !allowedRoles.includes(role)) {
        throw new https_1.HttpsError("permission-denied", "Active Management access required");
    }
    const { intakeId, approvedUid, note } = req.data || {};
    if (!intakeId || !approvedUid) {
        throw new Error("missing fields");
    }
    const intakeRef = db.collection("intakes").doc(String(intakeId));
    const intakeSnap = await intakeRef.get();
    const intake = intakeSnap.data() || {};
    const parentEmail = String(intake.parent?.email || "")
        .trim()
        .toLowerCase();
    let parentUid = "";
    if (parentEmail) {
        try {
            const user = await firebase_admin_1.default.auth().getUserByEmail(parentEmail);
            parentUid = user.uid;
        }
        catch {
            parentUid = "";
        }
    }
    await intakeRef.update({
        status: "approved",
        approvedUid,
        approvedAt: firestore_1.FieldValue.serverTimestamp(),
        note: note || null,
        linkedParentUid: parentUid || null,
        parentLinked: !!parentUid,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    if (parentUid) {
        await db
            .collection("parentAthleteLinks")
            .doc(`${parentUid}_${approvedUid}`)
            .set({
            parentUid,
            athleteUid: approvedUid,
            status: "active",
            intakeId,
            source: "approve_intake_existing_athlete",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        await db.collection("parents").doc(parentUid).set({
            uid: parentUid,
            email: parentEmail,
            athleteUid: approvedUid,
            primaryAthleteUid: approvedUid,
            status: "active",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    //
    // Parent Welcome Email
    //
    let welcomeEmailSent = false;
    let welcomeEmailError = null;
    if (parentEmail) {
        try {
            await (0, sendParentWelcomeEmail_1.sendParentWelcomeEmail)({
                parentEmail,
                parentName: intake.parent?.name ||
                    intake.parentName ||
                    "",
                athleteName: intake.athlete?.name ||
                    intake.athleteName ||
                    "",
                athleteUid: String(approvedUid),
                lang: intake.lang === "es" ||
                    intake.language === "es" ||
                    intake.languagePreference === "es" ||
                    intake.parent?.lang === "es" ||
                    intake.parent?.language === "es" ||
                    intake.parent?.languagePreference === "es"
                    ? "es"
                    : "en",
            });
            welcomeEmailSent = true;
            await intakeRef.update({
                welcomeEmailStatus: "sent",
                welcomeEmailSentAt: firestore_1.FieldValue.serverTimestamp(),
                welcomeEmailError: null,
            });
        }
        catch (err) {
            welcomeEmailError =
                err instanceof Error
                    ? err.message
                    : String(err);
            console.error("[approveIntakeCall] Parent welcome email failed:", welcomeEmailError);
            await intakeRef.update({
                welcomeEmailStatus: "failed",
                welcomeEmailError,
            });
        }
    }
    return {
        ok: true,
        intakeId,
        approvedUid,
        parentLinked: !!parentUid,
        parentUid: parentUid || null,
        welcomeEmailSent,
        welcomeEmailError,
    };
});
