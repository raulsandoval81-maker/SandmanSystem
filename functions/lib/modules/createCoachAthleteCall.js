"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoachAthleteCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
function pad4(n) {
    return String(n).padStart(4, "0");
}
function cleanString(v) {
    return String(v || "").trim();
}
exports.createCoachAthleteCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new Error("unauthenticated");
    const db = (0, firestore_1.getFirestore)();
    const { first, last, track, program, team, grade, birthYear, source, notes, framework, programTrack, art, ladderKey, rosterIds, coachIds, locationId, virtueName, virtueCode, mintVirtueTag, experience, placement, adjustment, } = req.data || {};
    if (!first || !last || !track) {
        throw new Error("missing athlete fields");
    }
    const cleanTrack = cleanString(track).toUpperCase();
    if (!["F4", "F8"].includes(cleanTrack)) {
        throw new Error("invalid track");
    }
    const counterRef = db.collection("counters").doc(cleanTrack.toLowerCase());
    const athlete = await db.runTransaction(async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const current = counterSnap.exists
            ? Number(counterSnap.get("next") || 1)
            : 1;
        const uid = `${cleanTrack}_${pad4(current)}`;
        const athleteRef = db.collection("athletes").doc(uid);
        const isF8 = cleanTrack === "F8";
        const xpAdjustment = Math.max(0, Number(adjustment?.amount || 0));
        const athleteData = {
            uid,
            athleteId: uid,
            first: cleanString(first),
            last: cleanString(last),
            publicName: `${cleanString(first)[0]}. ${cleanString(last)}`,
            track: cleanTrack,
            program: program || "wrestling",
            tier: "T0",
            rank: isF8 ? "Shadow" : "Apprentice",
            stripeCount: 0,
            xp: xpAdjustment,
            team: team || "",
            grade: grade || "",
            birthYear: birthYear || "",
            source: source || "coach_direct",
            notes: notes || "",
            status: "active",
            createdBy: "coach",
            intakePath: "coach_direct",
            parentLinked: false,
            parentStatus: "unlinked",
            framework: framework || "",
            programTrack: programTrack || "",
            art: art || "",
            ladderKey: ladderKey || cleanTrack,
            rosterIds: Array.isArray(rosterIds) ? rosterIds : [],
            coachIds: Array.isArray(coachIds) ? coachIds : [],
            locationId: locationId || "lompoc",
            virtueName: virtueName || "",
            virtueCode: virtueCode || "",
            mintVirtueTag: mintVirtueTag || "",
            mintVirtueTagDisplay: mintVirtueTag || "",
            placement: placement || null,
            experience: experience || {
                years: 0,
                placementOnly: true,
                grantsXP: false,
                transferXP: false,
                source: "coach_direct",
            },
            adjustment: xpAdjustment > 0
                ? {
                    amount: xpAdjustment,
                    note: adjustment?.note ||
                        "Paper pilot / late onboarding XP",
                    kind: adjustment?.kind ||
                        "PAPER_RECONCILE_GRIND",
                    source: adjustment?.source ||
                        "coach_direct_intake",
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                }
                : null,
            startingXp: xpAdjustment,
            startingXpReason: xpAdjustment > 0 ? "late_onboarding" : "",
            startingXpSource: xpAdjustment > 0 ? "coach_direct_intake" : "",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        tx.set(counterRef, {
            next: current + 1,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(athleteRef, athleteData, { merge: true });
        if (xpAdjustment > 0) {
            const logRef = athleteRef.collection("logs").doc();
            tx.set(logRef, {
                athleteUid: uid,
                amount: xpAdjustment,
                kind: "PAPER_RECONCILE_GRIND",
                source: "coach_direct_intake",
                note: adjustment?.note ||
                    "Paper pilot / late onboarding XP",
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        return athleteData;
    });
    return {
        ok: true,
        athlete,
    };
});
