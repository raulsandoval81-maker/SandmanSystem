"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAthleteFromIntakeCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("../../infra/admin");
const authzV2_1 = require("../../infra/authzV2");
function pad4(n) { return String(n).padStart(4, "0"); }
function pad6(n) { return String(n).padStart(6, "0"); }
function buildMintTag(track, lane, seq4, virtue) {
    return `${track}_${lane}${seq4}_${virtue}`;
}
exports.createAthleteFromIntakeCall = (0, https_1.onCall)(async (req) => {
    (0, authzV2_1.requireCoachOrAdminV2)(req);
    const { intakeId, mint, publicName, team, virtue } = req.data || {};
    if (!intakeId)
        throw new https_1.HttpsError("invalid-argument", "Missing intakeId");
    if (!mint?.uid || !mint?.lane)
        throw new https_1.HttpsError("invalid-argument", "Missing mint.uid or mint.lane");
    if (!publicName?.initial || !publicName?.last)
        throw new https_1.HttpsError("invalid-argument", "Missing publicName.initial/last");
    if (!team?.name)
        throw new https_1.HttpsError("invalid-argument", "Missing team.name");
    if (!virtue)
        throw new https_1.HttpsError("invalid-argument", "Missing virtue");
    const uid = String(mint.uid).trim();
    const lane = String(mint.lane).trim(); // "CB"
    const track = uid.startsWith("F8-") ? "F8" : uid.startsWith("F4-") ? "F4" : "";
    if (!track)
        throw new https_1.HttpsError("invalid-argument", "UID must start with F8- or F4-");
    // Enforce your rule: F8 = Combat only
    if (track === "F8" && lane !== "CB") {
        throw new https_1.HttpsError("failed-precondition", "Foundry 8 is Combat-only at launch.");
    }
    const intakeRef = admin_1.db.collection("intakes").doc(String(intakeId).trim());
    const athleteRef = admin_1.db.collection("athletes").doc(uid);
    const mintCounterRef = admin_1.db.collection("meta").doc("mintCounters").collection("byScope").doc(`${track}_${lane}`);
    const padlockCounterRef = admin_1.db.collection("meta").doc("padlockCounters").collection("byScope").doc("global");
    const result = await admin_1.db.runTransaction(async (tx) => {
        const intakeSnap = await tx.get(intakeRef);
        if (!intakeSnap.exists)
            throw new https_1.HttpsError("not-found", "Intake not found.");
        const intake = intakeSnap.data();
        if (intake.status !== "approved" || !intake.approvedUid) {
            throw new https_1.HttpsError("failed-precondition", "Intake must be approved first.");
        }
        // If athlete already exists, return it (idempotent)
        const aSnap = await tx.get(athleteRef);
        if (aSnap.exists) {
            return { ok: true, athlete: aSnap.data(), alreadyExisted: true };
        }
        // MintTag counter
        const mintCounterSnap = await tx.get(mintCounterRef);
        const mintCurrent = (mintCounterSnap.exists ? mintCounterSnap.data().current : 0);
        const mintNext = mintCurrent + 1;
        tx.set(mintCounterRef, {
            current: mintNext,
            updatedAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        const mintSeq4 = pad4(mintNext);
        const mintTag = buildMintTag(track, lane, mintSeq4, String(virtue).trim().toUpperCase());
        // Padlock counter
        const padSnap = await tx.get(padlockCounterRef);
        const padCurrent = (padSnap.exists ? padSnap.data().current : 0);
        const letter = (padSnap.exists ? padSnap.data().letter : "A");
        const padNext = padCurrent + 1;
        tx.set(padlockCounterRef, {
            current: padNext,
            letter,
            updatedAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        const padlock = `${letter}${pad6(padNext)}`;
        const tier = "T0";
        const rank = track === "F8" ? "Shadow" : "Apprentice";
        const first = intake.first ?? intake.athlete?.first ?? "";
        const last = intake.last ?? intake.athlete?.last ?? "";
        const dob = intake.dob ?? intake.athlete?.dob ?? null;
        const athlete = {
            uid, track, lane, tier, rank,
            xp: 0,
            xpStrength: 0,
            xpHonor: 0,
            fullName: `${first} ${last}`.trim(),
            dob,
            publicName: `${publicName.initial} ${publicName.last}`.trim(),
            publicInitial: String(publicName.initial).trim(),
            publicLast: String(publicName.last).trim(),
            team: String(team.name).trim(),
            city: String(team.city || "").trim(),
            state: String(team.state || "").trim(),
            mintVirtueTag: mintTag,
            mintVirtueTagDisplay: mintTag,
            mintSeq: mintNext,
            padlock,
            padlockSeq: padNext,
            intakeTokenId: intakeSnap.id,
            createdAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
        };
        tx.set(athleteRef, athlete, { merge: false });
        // mark intake as “activated” (separate from approved)
        tx.set(intakeRef, {
            activatedUid: uid,
            activatedAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, athlete };
    });
    return result;
});
