"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveIntakeCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("../../infra/admin");
const authzV2_1 = require("../../infra/authzV2");
process.on("uncaughtException", (e) => {
    console.error("🔥 uncaughtException:", e?.stack || e);
});
process.on("unhandledRejection", (e) => {
    console.error("🔥 unhandledRejection:", e?.stack || e);
});
exports.approveIntakeCall = (0, https_1.onCall)(async (req) => {
    console.log("✅ APPROVEINTAKECALL HIT (LOCAL CODE)", new Date().toISOString());
    try {
        console.log("req.auth?", !!req.auth, "keys(data)", Object.keys(req.data || {}));
        (0, authzV2_1.requireCoachOrAdminV2)(req);
        // ...
        const intakeId = String(req.data?.intakeId || req.data?.tokenId || req.data?.token || "").trim();
        const approvedUid = String(req.data?.approvedUid || "").trim().toUpperCase();
        const note = req.data?.note ? String(req.data.note).slice(0, 240) : null;
        if (!intakeId)
            throw new https_1.HttpsError("invalid-argument", "Missing intakeId");
        if (!approvedUid)
            throw new https_1.HttpsError("invalid-argument", "Missing approvedUid");
        const track = approvedUid.startsWith("F8-") ? "F8" :
            approvedUid.startsWith("F4-") ? "F4" : "";
        if (!track)
            throw new https_1.HttpsError("invalid-argument", "approvedUid must start with F8- or F4-");
        const intakeRef = admin_1.db.collection("intakes").doc(intakeId);
        const snap = await intakeRef.get();
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Intake not found");
        const intake = snap.data();
        if ((intake?.status === "approved" || intake?.activatedUid) && intake?.approvedUid) {
            return {
                ok: true,
                intakeId: snap.id,
                approvedUid: intake.approvedUid,
                status: intake.status || "approved",
                alreadyApproved: true
            };
        }
        await intakeRef.set({
            status: "approved",
            approvedUid,
            approvedAt: admin_1.FieldValue.serverTimestamp(),
            used: true,
            approveNote: note,
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, intakeId: snap.id, approvedUid, status: "approved" };
    }
    catch (err) {
        console.error("approveIntakeCall CRASH:", err?.stack || err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", err?.message || "approveIntakeCall crashed");
    }
});
