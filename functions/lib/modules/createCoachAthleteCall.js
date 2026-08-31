"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoachAthleteCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
function pad4(n) {
    return String(n).padStart(4, "0");
}
function cleanString(value) {
    return String(value ?? "").trim();
}
function cleanEmail(value) {
    return cleanString(value).toLowerCase();
}
function cleanPhone(value) {
    return cleanString(value)
        .replace(/\D/g, "")
        .slice(0, 10);
}
function cleanArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => cleanString(item))
        .filter(Boolean);
}
function calculateAge(dobRaw) {
    const dob = cleanString(dobRaw);
    if (!dob) {
        return null;
    }
    const birth = new Date(`${dob}T12:00:00`);
    if (Number.isNaN(birth.getTime())) {
        return null;
    }
    const today = new Date();
    let age = today.getFullYear() -
        birth.getFullYear();
    const monthDifference = today.getMonth() -
        birth.getMonth();
    const dayDifference = today.getDate() -
        birth.getDate();
    if (monthDifference < 0 ||
        (monthDifference === 0 &&
            dayDifference < 0)) {
        age -= 1;
    }
    return age;
}
function buildExperiencePlan(yearsRaw) {
    const years = Number(yearsRaw || 0);
    if (years === 1) {
        return {
            yearsVerified: 1,
            total: 200,
            issuedNow: 200,
            held: 0,
            hold: false,
            schedule: "full_t0",
            note: "External legacy — 1 year of prior experience verified and honored.",
        };
    }
    if (years === 2) {
        return {
            yearsVerified: 2,
            total: 400,
            issuedNow: 200,
            held: 200,
            hold: true,
            schedule: "deferred_t1_entry",
            note: "External legacy — 2 years of prior experience verified and honored.",
        };
    }
    if (years >= 3) {
        return {
            yearsVerified: 3,
            total: 600,
            issuedNow: 300,
            held: 300,
            hold: true,
            schedule: "deferred_t1_entry",
            note: "External legacy — 3 years of prior experience verified and honored.",
        };
    }
    return {
        yearsVerified: 0,
        total: 0,
        issuedNow: 0,
        held: 0,
        hold: false,
        schedule: null,
        note: null,
    };
}
exports.createCoachAthleteCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new Error("unauthenticated");
    }
    const authenticatedCoachUid = req.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const data = req.data || {};
    const { first, last, fullName, publicName, dob, birthYear, grade, track, trackCode, program, framework, journey, programTrack, art, discipline, primaryDiscipline, ladderKey, rosterIds, coachIds, locationId, profileType, beltSet, badgeSet, team, city, state, location, parent, parentName, parentEmail, parentPhoneDigits, emergency, emergencyName, emergencyPhoneDigits, medical, waiver, intakeMethod, paperIntakeVerified, source, notes, virtueName, virtueCode, mintVirtueTag, experience, placement, lifecycleDefaults, adjustment, } = data;
    const cleanFirst = cleanString(first);
    const cleanLast = cleanString(last);
    const cleanTrack = cleanString(track).toUpperCase();
    if (!cleanFirst ||
        !cleanLast ||
        !cleanTrack) {
        throw new Error("missing athlete fields");
    }
    if (!["F4", "F8"].includes(cleanTrack)) {
        throw new Error("invalid track");
    }
    const cleanDob = cleanString(dob);
    const cleanBirthYear = cleanString(birthYear) ||
        cleanDob.match(/^(\d{4})-/)?.[1] ||
        "";
    const cleanCity = cleanString(location?.city ||
        city);
    const cleanState = cleanString(location?.state ||
        state)
        .toUpperCase()
        .slice(0, 2);
    const cleanTeam = cleanString(location?.team ||
        team);
    const cleanLocationId = cleanString(location?.locationId ||
        locationId) || "lompoc";
    const parentRecord = {
        name: cleanString(parent?.name ||
            parentName),
        email: cleanEmail(parent?.email ||
            parentEmail),
        phoneDigits: cleanPhone(parent?.phoneDigits ||
            parentPhoneDigits),
    };
    const emergencyRecord = {
        name: cleanString(emergency?.name ||
            emergencyName),
        phoneDigits: cleanPhone(emergency?.phoneDigits ||
            emergencyPhoneDigits),
    };
    const waiverRecord = {
        viewed: waiver?.viewed === true,
        agreed: waiver?.agreed === true,
        method: cleanString(waiver?.method) || "paper",
        signatureName: cleanString(waiver?.signatureName),
        signatureDate: cleanString(waiver?.signatureDate),
        verifiedByCoach: waiver?.verifiedByCoach === true,
    };
    const cleanIntakeMethod = cleanString(intakeMethod) ||
        "paper";
    if (cleanIntakeMethod === "paper") {
        if (!cleanDob &&
            !cleanBirthYear) {
            throw new Error("date of birth or birth year required");
        }
        if (!parentRecord.name ||
            !parentRecord.email ||
            parentRecord.phoneDigits.length !== 10) {
            throw new Error("complete parent or guardian information required");
        }
        if (!emergencyRecord.name ||
            emergencyRecord.phoneDigits.length !== 10) {
            throw new Error("complete emergency contact required");
        }
        if (!cleanCity ||
            !cleanState) {
            throw new Error("city and state required");
        }
        if (!waiverRecord.agreed ||
            !waiverRecord.signatureName ||
            !waiverRecord.signatureDate ||
            !waiverRecord.verifiedByCoach) {
            throw new Error("verified paper waiver required");
        }
    }
    const cleanProgram = cleanString(program) ||
        "wrestling";
    const cleanFramework = cleanString(framework);
    const cleanJourney = cleanString(journey ||
        placement?.journey);
    const cleanProgramTrack = cleanString(programTrack ||
        placement?.programTrack);
    const cleanArt = cleanString(art) ||
        cleanProgram;
    const cleanDiscipline = cleanString(discipline) ||
        cleanArt;
    const cleanPrimaryDiscipline = cleanString(primaryDiscipline) ||
        cleanDiscipline;
    const cleanLadderKey = cleanString(ladderKey) ||
        cleanTrack;
    const cleanTrackCode = cleanString(trackCode ||
        placement?.trackCode) ||
        (cleanTrack === "F8"
            ? "zero2hero-wrestling"
            : "path2legend-wrestling");
    const cleanProfileType = cleanString(profileType) ||
        (cleanTrack === "F8"
            ? "youth"
            : "adult");
    const cleanBeltSet = cleanString(beltSet) ||
        (cleanTrack === "F8"
            ? "f8-youth"
            : "f4");
    const cleanBadgeSet = cleanString(badgeSet) ||
        (cleanTrack === "F8"
            ? "f8-youth"
            : "f4");
    const cleanRosterIds = cleanArray(rosterIds);
    const cleanCoachIds = cleanArray(coachIds);
    const cleanVirtueName = cleanString(virtueName)
        .toUpperCase();
    const cleanVirtueCode = cleanString(virtueCode)
        .toUpperCase();
    const counterRef = db
        .collection("counters")
        .doc(cleanTrack.toLowerCase());
    const athlete = await db.runTransaction(async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const current = counterSnap.exists
            ? Number(counterSnap.get("next") ||
                1)
            : 1;
        const uid = `${cleanTrack}_${pad4(current)}`;
        const athleteRef = db
            .collection("athletes")
            .doc(uid);
        const isF8 = cleanTrack === "F8";
        const xpAdjustment = Math.max(0, Number(adjustment?.amount ||
            0));
        const experienceYears = Number(experience?.years ||
            0);
        /*
         * PRESERVED LEGACY RULE
         *
         * 1 year  -> 200 now
         * 2 years -> 200 now / 200 held
         * 3+      -> 300 now / 300 held
         */
        const expPlan = buildExperiencePlan(experienceYears);
        const hasLegacy = expPlan.total > 0;
        const totalXp = xpAdjustment +
            expPlan.issuedNow;
        const rankName = isF8
            ? "Shadow"
            : "Apprentice";
        const generatedMintTag = cleanVirtueName
            ? `${cleanTrack}_CB${pad4(current)}_${cleanVirtueName}`
            : cleanString(mintVirtueTag);
        const resolvedRankColor = isF8
            ? "white-gray"
            : cleanArt === "boxing"
                ? "gray"
                : "white";
        const resolvedPublicName = cleanString(publicName) ||
            `${cleanFirst[0]}. ${cleanLast}`;
        const resolvedFullName = cleanString(fullName) ||
            `${cleanFirst} ${cleanLast}`;
        const athleteData = {
            uid,
            athleteId: uid,
            first: cleanFirst,
            last: cleanLast,
            fullName: resolvedFullName,
            publicName: resolvedPublicName,
            dob: cleanDob || null,
            birthYear: cleanBirthYear || null,
            age: calculateAge(cleanDob),
            grade: cleanString(grade) ||
                null,
            track: cleanProgramTrack,
            trackCode: cleanTrackCode,
            program: cleanProgram,
            tier: "T0",
            ...(isF8 ? {
                progressionTier: "T0",
                curriculumTier: "T0",
                curriculumVersion: "f8-curriculum-bridge-v1",
            } : {}),
            rank: rankName,
            rankName,
            rankColor: resolvedRankColor,
            stripeCount: 0,
            /*
             * PRESERVED RESERVE CAPS
             */
            xp: totalXp,
            xpCap: isF8
                ? 800
                : 1000,
            xpSource: hasLegacy
                ? "intake+legacy"
                : xpAdjustment > 0
                    ? "coach_direct_intake"
                    : "coach_direct",
            isCanonical: true,
            isDev: false,
            promotionLocked: lifecycleDefaults
                ?.promotionLocked !==
                false,
            /*
             * PRESERVED LEGACY DATA
             */
            legacy: hasLegacy,
            legacyType: hasLegacy
                ? "external"
                : null,
            legacyYearsVerified: expPlan.yearsVerified,
            legacyCreditTotal: expPlan.total,
            legacyCreditIssued: expPlan.issuedNow,
            legacyHold: expPlan.hold,
            legacyCreditSchedule: expPlan.schedule,
            legacyNote: expPlan.note,
            testing: {
                state: lifecycleDefaults
                    ?.testing?.state ||
                    "ACTIVE",
                coachReady: false,
                coachReadyAt: null,
                cooldownUntil: null,
                freezeUntil: null,
                lastTestResult: null,
                templeEnteredAt: null,
                testEligibleAt: null,
                testingStartedAt: null,
                tier: "T0",
                track: cleanProgramTrack,
                trackCode: cleanTrackCode,
            },
            framework: cleanFramework,
            journey: cleanJourney,
            programTrack: cleanProgramTrack,
            art: cleanArt,
            discipline: cleanDiscipline,
            primaryDiscipline: cleanPrimaryDiscipline,
            ladderKey: cleanLadderKey,
            rosterIds: cleanRosterIds,
            coachIds: cleanCoachIds,
            locationId: cleanLocationId,
            profileType: cleanProfileType,
            beltSet: cleanBeltSet,
            badgeSet: cleanBadgeSet,
            location: {
                team: cleanTeam || null,
                city: cleanCity,
                state: cleanState,
                locationId: cleanLocationId,
            },
            team: cleanTeam,
            city: cleanCity,
            state: cleanState,
            parent: parentRecord,
            parentName: parentRecord.name ||
                null,
            parentEmail: parentRecord.email ||
                null,
            parentPhoneDigits: parentRecord.phoneDigits ||
                null,
            parentLinked: false,
            parentStatus: "unlinked",
            emergency: emergencyRecord,
            emergencyName: emergencyRecord.name ||
                null,
            emergencyPhoneDigits: emergencyRecord
                .phoneDigits ||
                null,
            medical: cleanString(medical) ||
                "None",
            waiver: waiverRecord,
            intakeMethod: cleanIntakeMethod,
            paperIntakeVerified: paperIntakeVerified ===
                true,
            source: cleanString(source) ||
                "coach_paper_intake",
            notes: cleanString(notes),
            status: "active",
            createdBy: authenticatedCoachUid,
            createdByRole: "coach",
            intakePath: cleanIntakeMethod ===
                "paper"
                ? "coach_paper_intake"
                : "coach_direct",
            coachEntered: true,
            virtueName: cleanVirtueName,
            virtueCode: cleanVirtueCode,
            mintVirtueTag: generatedMintTag,
            mintVirtueTagDisplay: generatedMintTag,
            placement: {
                ...(placement || {}),
                framework: cleanFramework,
                journey: cleanJourney,
                programTrack: cleanProgramTrack,
                program: cleanProgram,
                art: cleanArt,
                discipline: cleanDiscipline,
                primaryDiscipline: cleanPrimaryDiscipline,
                ladderKey: cleanLadderKey,
                track: cleanProgramTrack,
                trackCode: cleanTrackCode,
                rosterIds: cleanRosterIds,
                coachIds: cleanCoachIds,
                locationId: cleanLocationId,
                profileType: cleanProfileType,
                beltSet: cleanBeltSet,
                badgeSet: cleanBadgeSet,
                source: "coach_paper_intake",
            },
            /*
             * Experience continues to grant
             * legacy credit according to the
             * preserved rule above.
             */
            experience: experience || {
                years: 0,
                placementOnly: false,
                grantsXP: true,
                transferXP: false,
                source: "coach_direct",
            },
            adjustment: xpAdjustment > 0
                ? {
                    amount: xpAdjustment,
                    note: adjustment
                        ?.note ||
                        "Paper pilot / late onboarding XP",
                    kind: adjustment
                        ?.kind ||
                        "PAPER_RECONCILE_GRIND",
                    source: adjustment
                        ?.source ||
                        "coach_direct_intake",
                    createdAt: firestore_1.FieldValue
                        .serverTimestamp(),
                }
                : null,
            startingXp: xpAdjustment,
            startingXpReason: xpAdjustment > 0
                ? "late_onboarding"
                : "",
            startingXpSource: xpAdjustment > 0
                ? "coach_direct_intake"
                : "",
            createdAt: firestore_1.FieldValue
                .serverTimestamp(),
            updatedAt: firestore_1.FieldValue
                .serverTimestamp(),
        };
        tx.set(counterRef, {
            next: current + 1,
            updatedAt: firestore_1.FieldValue
                .serverTimestamp(),
        }, {
            merge: true,
        });
        tx.set(athleteRef, athleteData, {
            merge: true,
        });
        if (xpAdjustment > 0) {
            const logRef = athleteRef
                .collection("logs")
                .doc();
            tx.set(logRef, {
                athleteUid: uid,
                amount: xpAdjustment,
                kind: adjustment?.kind ||
                    "PAPER_RECONCILE_GRIND",
                source: adjustment?.source ||
                    "coach_direct_intake",
                note: adjustment?.note ||
                    "Paper pilot / late onboarding XP",
                createdAt: firestore_1.FieldValue
                    .serverTimestamp(),
            });
        }
        /*
         * PRESERVED LEGACY XP LOG
         */
        if (expPlan.issuedNow > 0) {
            const legacyLogRef = athleteRef
                .collection("logs")
                .doc();
            tx.set(legacyLogRef, {
                athleteUid: uid,
                amount: expPlan.issuedNow,
                kind: "LEGACY_CREDIT",
                source: "coach_direct_intake",
                note: expPlan.note,
                legacyCreditTotal: expPlan.total,
                legacyCreditHeld: expPlan.held,
                legacyCreditSchedule: expPlan.schedule,
                createdAt: firestore_1.FieldValue
                    .serverTimestamp(),
            });
        }
        return athleteData;
    });
    return {
        ok: true,
        athlete,
    };
});
