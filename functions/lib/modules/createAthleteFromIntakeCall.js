"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAthleteFromIntakeCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.createAthleteFromIntakeCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new Error("unauthenticated");
    const { intakeId, mint, publicName, team, virtue } = req.data;
    if (!intakeId || !mint?.uid)
        throw new Error("missing mint data");
    const db = (0, firestore_1.getFirestore)();
    const intakeSnap = await db.collection("intakes").doc(intakeId).get();
    if (!intakeSnap.exists)
        throw new Error("intake not found");
    const intake = intakeSnap.data() || {};
    const loc = intake.location || {};
    // Detect Foundry 8 reliably (supports multiple field styles)
    const isF8 = (intake.track || "").includes("foundry8") ||
        intake.program === "F8" ||
        intake.track === "F8";
    const athleteData = {
        uid: mint.uid,
        track: intake.track || null,
        tier: "T0",
        rank: isF8 ? "Shadow" : "Apprentice",
        stripeCount: 0,
        xp: 0,
        publicName: `${publicName.initial}. ${publicName.last}`,
        // ✅ intake v2 stores nested location.{team,city,state}
        // keep fallbacks for any legacy intakes
        team: loc.team || intake.teamSchool || intake.team || team?.name || "",
        city: loc.city || intake.city || team?.city || "",
        state: loc.state || intake.state || team?.state || "",
        virtue,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await db.collection("athletes").doc(mint.uid).set(athleteData, { merge: true });
    return { athlete: athleteData };
});
