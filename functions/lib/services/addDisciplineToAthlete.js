"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDisciplineToAthlete = addDisciplineToAthlete;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
function clean(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}
function startingRankColor(framework, programTrack, discipline) {
    const fw = clean(framework);
    const journey = clean(programTrack);
    const art = clean(discipline);
    if (fw === "foundry8") {
        return "white";
    }
    if (journey === "quest2mastery") {
        return "gray";
    }
    if (journey === "path2legend") {
        if (art === "wrestling" ||
            art === "submission-grappling") {
            return "white";
        }
        return "gray";
    }
    return "gray";
}
async function addDisciplineToAthlete(db, coachUid, input) {
    const existingAthleteUid = String(input.existingAthleteUid || "")
        .trim()
        .toUpperCase();
    const discipline = clean(input.art);
    const trackCode = clean(input.trackCode);
    const programTrack = clean(input.programTrack);
    const framework = clean(input.framework);
    const foundry = clean(input.foundry);
    const ladderKey = String(input.ladderKey || "")
        .trim();
    const rosterIds = Array.isArray(input.rosterIds)
        ? input.rosterIds
            .map((x) => String(x || "").trim())
            .filter(Boolean)
        : [];
    const coachIds = Array.isArray(input.coachIds)
        ? input.coachIds
            .map((x) => String(x || "").trim())
            .filter(Boolean)
        : [];
    const locationId = String(input.locationId || "").trim() ||
        null;
    const intakeId = String(input.intakeId || "").trim();
    if (!existingAthleteUid) {
        throw new https_1.HttpsError("invalid-argument", "Missing existingAthleteUid.");
    }
    if (!discipline) {
        throw new https_1.HttpsError("invalid-argument", "Missing discipline.");
    }
    if (!trackCode || !programTrack) {
        throw new https_1.HttpsError("invalid-argument", "Missing trackCode or programTrack.");
    }
    if (!["f4", "f8"].includes(foundry)) {
        throw new https_1.HttpsError("invalid-argument", `Invalid foundry: ${input.foundry}`);
    }
    const athleteRef = db.doc(`athletes/${existingAthleteUid}`);
    const intakeRef = intakeId
        ? db.doc(`intakes/${intakeId}`)
        : null;
    return db.runTransaction(async (tx) => {
        const athleteSnap = await tx.get(athleteRef);
        if (!athleteSnap.exists) {
            throw new https_1.HttpsError("not-found", `Athlete not found: ${existingAthleteUid}`);
        }
        const athleteData = athleteSnap.data() || {};
        let intakeData = null;
        if (intakeRef) {
            const intakeSnap = await tx.get(intakeRef);
            if (!intakeSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", `Submission doc missing: ${intakeRef.path}`);
            }
            intakeData =
                intakeSnap.data() || {};
            const status = clean(intakeData.status);
            const approvedUid = String(intakeData.approvedUid || "")
                .trim()
                .toUpperCase();
            if (status === "approved" &&
                approvedUid === existingAthleteUid) {
                return {
                    uid: existingAthleteUid,
                    discipline,
                    idempotent: true,
                };
            }
            if (status &&
                status !== "submitted") {
                throw new https_1.HttpsError("failed-precondition", `Submission not approvable: ${status}`);
            }
        }
        const disciplines = athleteData.disciplines &&
            typeof athleteData.disciplines ===
                "object"
            ? athleteData.disciplines
            : {};
        const legacyDiscipline = clean(athleteData.primaryDiscipline ||
            athleteData.discipline ||
            athleteData.art ||
            athleteData.sport);
        const legacyTrackCode = clean(athleteData.trackCode);
        const alreadyNested = Object.prototype.hasOwnProperty.call(disciplines, discipline);
        const alreadyLegacy = legacyDiscipline === discipline ||
            legacyTrackCode.endsWith(`-${discipline}`);
        if (alreadyNested || alreadyLegacy) {
            throw new https_1.HttpsError("already-exists", `${existingAthleteUid} already has ${discipline}.`);
        }
        const now = firestore_1.FieldValue.serverTimestamp();
        const starter = foundry === "f8"
            ? {
                tier: "T0",
                rankName: "Shadow",
                xpCap: 600,
            }
            : {
                tier: "T0",
                rankName: "Apprentice",
                xpCap: 1000,
            };
        const rankColor = startingRankColor(framework, programTrack, discipline);
        const disciplineRecord = {
            discipline,
            primaryDiscipline: discipline,
            sport: discipline,
            art: discipline,
            framework,
            journey: programTrack,
            program: programTrack,
            programTrack,
            track: programTrack,
            trackCode,
            ladderKey,
            rosterIds,
            coachIds,
            locationId,
            placement: input.placement || null,
            tier: starter.tier,
            rankName: starter.rankName,
            rankColor,
            xp: 0,
            xpCap: starter.xpCap,
            stripeCount: 0,
            testing: {
                state: "ACTIVE",
                coachReady: false,
                coachReadyAt: null,
                testingStartedAt: null,
                cooldownUntil: null,
                freezeUntil: null,
                lastTestResult: null,
                templeEnteredAt: null,
                testEligibleAt: null,
            },
            createdAt: now,
            updatedAt: now,
        };
        const athletePatch = {
            [`disciplines.${discipline}`]: disciplineRecord,
            disciplineIds: firestore_1.FieldValue.arrayUnion(discipline),
            updatedAt: now,
        };
        if (rosterIds.length) {
            athletePatch.rosterIds =
                firestore_1.FieldValue.arrayUnion(...rosterIds);
        }
        if (!athleteData.activeDiscipline) {
            athletePatch.activeDiscipline =
                legacyDiscipline ||
                    discipline;
        }
        tx.update(athleteRef, athletePatch);
        if (intakeRef) {
            tx.update(intakeRef, {
                status: "approved",
                used: true,
                approved: true,
                approvedUid: existingAthleteUid,
                approvedAt: now,
                minted: false,
                attachedSport: true,
                mode: "add_sport",
                existingAthleteUid,
                requestedDiscipline: discipline,
                framework,
                programTrack,
                track: programTrack,
                trackCode,
                art: discipline,
                ladderKey,
                rosterIds,
                coachIds,
                locationId,
                placement: input.placement || null,
                updatedAt: now,
            });
        }
        const receiptRef = db.collection("receipts").doc();
        tx.create(receiptRef, {
            type: "ATHLETE_DISCIPLINE_ADDED",
            mode: "add_sport",
            source: intakeRef
                ? "parent_intake"
                : "coach_direct",
            intakeId: intakeId || null,
            uid: existingAthleteUid,
            discipline,
            framework,
            programTrack,
            track: programTrack,
            trackCode,
            art: discipline,
            ladderKey,
            rosterIds,
            coachIds,
            locationId,
            tier: starter.tier,
            rankName: starter.rankName,
            rankColor,
            xp: 0,
            xpCap: starter.xpCap,
            stripeCount: 0,
            coachUid,
            createdAt: now,
        });
        return {
            uid: existingAthleteUid,
            discipline,
            receiptId: receiptRef.id,
            idempotent: false,
        };
    });
}
