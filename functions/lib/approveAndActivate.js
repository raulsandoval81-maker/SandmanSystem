"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveAndActivate = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
if (!admin.apps.length)
    admin.initializeApp();
const db = (0, firestore_1.getFirestore)();
function computeStartingStripeCount(xp, xpCap) {
    const safeXp = Math.max(0, Number(xp || 0));
    const safeCap = Math.max(1, Number(xpCap || 0));
    const stripeUnit = safeCap / 4;
    const raw = Math.floor(safeXp / stripeUnit);
    return Math.max(0, Math.min(4, raw));
}
function pad4(n) {
    return String(n).padStart(4, "0");
}
function buildExperiencePlan(yearsRaw) {
    const years = Number(yearsRaw || 0);
    if (years === 1) {
        return {
            yearsVerified: 1,
            total: 200,
            issuedNow: 200,
            hold: false,
            schedule: "full_t0",
            note: "External legacy — 1 year of prior experience verified and honored",
        };
    }
    if (years === 2) {
        return {
            yearsVerified: 2,
            total: 400,
            issuedNow: 200,
            hold: true,
            schedule: "deferred_t1_entry",
            note: "External legacy — 2 years of prior experience verified and honored",
        };
    }
    if (years >= 3) {
        return {
            yearsVerified: 3,
            total: 600,
            issuedNow: 300,
            hold: true,
            schedule: "deferred_t1_entry",
            note: "External legacy — 3 years of prior experience verified and honored",
        };
    }
    return {
        yearsVerified: 0,
        total: 0,
        issuedNow: 0,
        hold: false,
        schedule: null,
        note: null,
    };
}
exports.approveAndActivate = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Sign-in required");
    }
    const coachUid = req.auth.uid;
    try {
        const input = req.data;
        if (!input?.intakeId ||
            !input?.foundry ||
            !input?.virtueName ||
            !input?.virtueCode ||
            !input?.trackCode) {
            throw new https_1.HttpsError("invalid-argument", "Missing required fields");
        }
        const { intakeId, foundry: foundryRaw, virtueName, virtueCode, trackCode, fullName, publicName, parent, team, mint, experience, adjustment, } = input;
        const foundry = String(foundryRaw || "").trim().toLowerCase();
        if (foundry !== "f4" && foundry !== "f8") {
            throw new https_1.HttpsError("invalid-argument", `Invalid foundry: ${foundryRaw}`);
        }
        const lane = String(mint?.lane || "CB").trim().toUpperCase() || "CB";
        const expPlan = buildExperiencePlan(experience?.years);
        const adjustmentAmount = Number(adjustment?.amount || 0);
        const adjustmentNote = adjustmentAmount > 0
            ? String(adjustment?.note || "Coach adjustment")
            : null;
        const hasLegacy = expPlan.total > 0;
        const hasAdjustment = adjustmentAmount > 0;
        const counterRef = db.doc(`counters/${foundry}`);
        const intakeRef = db.doc(`intakes/${intakeId}`);
        const intakeSnapPre = await intakeRef.get();
        if (!intakeSnapPre.exists) {
            throw new https_1.HttpsError("failed-precondition", `Submission doc missing: ${intakeRef.path}`);
        }
        const intakeDataPre = intakeSnapPre.data() || {};
        const parentEmailPre = String(parent?.email || intakeDataPre.parent?.email || "")
            .trim()
            .toLowerCase() || null;
        let parentUid = null;
        if (parentEmailPre) {
            try {
                const userRecord = await admin.auth().getUserByEmail(parentEmailPre);
                parentUid = userRecord.uid;
            }
            catch {
                parentUid = null;
            }
        }
        const result = await db.runTransaction(async (tx) => {
            const intakeSnap = await tx.get(intakeRef);
            if (!intakeSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", `Submission doc missing: ${intakeRef.path}`);
            }
            const intakeData = intakeSnap.data() || {};
            const loc = (intakeData.location || {});
            const teamName = String(team?.name || "").trim() ||
                String(loc.team || "").trim() ||
                null;
            const cityName = String(team?.city || "").trim() ||
                String(loc.city || "").trim() ||
                null;
            const stateCode = String(team?.state || loc.state || "")
                .trim()
                .toUpperCase()
                .slice(0, 2) || null;
            const teamId = String(team?.teamId || "").trim() ||
                String(loc.teamId || "").trim() ||
                null;
            const parentEmail = String(parent?.email || intakeData.parent?.email || "")
                .trim()
                .toLowerCase() || null;
            const parentPhoneDigits = String(parent?.phoneDigits || intakeData.parent?.phoneDigits || "").trim() || null;
            const parentName = String(parent?.name || intakeData.parent?.name || intakeData.waiver?.signatureName || "").trim() || null;
            const existingApprovedUid = String(intakeSnap.get("approvedUid") || "").trim();
            const existingStatus = String(intakeSnap.get("status") || "").trim().toLowerCase();
            if (existingStatus === "approved" && existingApprovedUid) {
                const existingMintTag = String(intakeSnap.get("mintVirtueTagSerial") || intakeSnap.get("mintVirtueTag") || "").trim();
                if (existingMintTag) {
                    return { uid: existingApprovedUid, mintVirtueTag: existingMintTag, idempotent: true };
                }
                const existingAthleteSnap = await tx.get(db.doc(`athletes/${existingApprovedUid}`));
                const athleteMintTag = existingAthleteSnap.exists
                    ? String(existingAthleteSnap.get("mintVirtueTag") || "").trim()
                    : "";
                return { uid: existingApprovedUid, mintVirtueTag: athleteMintTag || "", idempotent: true };
            }
            const exp = intakeSnap.get("exp");
            if (typeof exp === "number" && exp < Date.now()) {
                throw new https_1.HttpsError("failed-precondition", "Submission expired");
            }
            if (existingStatus && existingStatus !== "submitted") {
                throw new https_1.HttpsError("failed-precondition", `Submission not approvable: ${existingStatus}`);
            }
            const counterSnap = await tx.get(counterRef);
            if (!counterSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", `Counter doc missing: ${counterRef.path}`);
            }
            const next = counterSnap.get("next");
            if (typeof next !== "number" || !Number.isFinite(next) || next < 1) {
                throw new https_1.HttpsError("failed-precondition", `Invalid counter.next in ${counterRef.path} (must be a number)`);
            }
            const n = next;
            const prefix = foundry.toUpperCase();
            const uid = `${prefix}_${pad4(n)}`;
            const vName = String(virtueName || "").trim().toUpperCase();
            const vCode = String(virtueCode || "").trim().toUpperCase();
            const mintVirtueTag = `${prefix}_CB${pad4(n)}_${vName}`;
            const athleteRef = db.doc(`athletes/${uid}`);
            const athleteSnap = await tx.get(athleteRef);
            if (athleteSnap.exists) {
                throw new https_1.HttpsError("already-exists", `Athlete already exists: ${uid}`);
            }
            const now = firestore_1.FieldValue.serverTimestamp();
            tx.update(counterRef, { next: n + 1 });
            const starter = foundry === "f4"
                ? { tier: "T0", rankName: "Apprentice", rankColor: "white", xpCap: 1200 }
                : { tier: "T0", rankName: "Shadow", rankColor: "white", xpCap: 600 };
            const startingXp = expPlan.issuedNow + adjustmentAmount;
            const stripeCount = computeStartingStripeCount(startingXp, starter.xpCap);
            tx.create(athleteRef, {
                uid,
                uidCode: uid,
                coachUid,
                tier: starter.tier,
                rankName: starter.rankName,
                rankColor: starter.rankColor,
                xpCap: starter.xpCap,
                track: trackCode,
                trackCode,
                onboarding: {
                    version: "v1",
                    status: "new",
                    step: 1,
                    locks: {}
                },
                team: teamName,
                teamId,
                city: cityName,
                state: stateCode,
                parentUid,
                parentEmail,
                parentPhoneDigits,
                parentName,
                virtue: vName,
                virtueName: vName,
                virtueCode: vCode,
                mintVirtueTag,
                mintVirtueTagDisplay: mintVirtueTag,
                xp: startingXp,
                stripeCount,
                xpSource: hasLegacy && hasAdjustment
                    ? "intake+legacy+adjustment"
                    : hasLegacy
                        ? "intake+legacy"
                        : hasAdjustment
                            ? "intake+adjustment"
                            : "intake",
                adjustmentAmount: hasAdjustment ? adjustmentAmount : 0,
                adjustmentNote,
                legacy: hasLegacy,
                legacyType: hasLegacy ? "external" : null,
                legacyYearsVerified: expPlan.yearsVerified,
                legacyCreditTotal: expPlan.total,
                legacyCreditIssued: expPlan.issuedNow,
                legacyHold: expPlan.hold,
                legacyCreditSchedule: expPlan.schedule,
                legacyNote: expPlan.note,
                promotionLocked: true,
                testing: {
                    state: "ACTIVE",
                    coachReady: false,
                    coachReadyAt: null,
                    testingStartedAt: null,
                    cooldownUntil: null,
                    freezeUntil: null,
                    lastTestResult: null,
                    templeEnteredAt: null,
                    testEligibleAt: null
                },
                unlocks: {
                    strength: true,
                    honor: false,
                    merit: false,
                },
                fullName: fullName ?? null,
                publicName: publicName ?? null,
                isCanonical: true,
                isDev: false,
                createdAt: now,
                updatedAt: now,
            });
            if (parentUid) {
                const parentLinkRef = db.doc(`parentAthleteLinks/${parentUid}_${uid}`);
                tx.set(parentLinkRef, {
                    parentUid,
                    athleteUid: uid,
                    status: "active",
                    parentEmail,
                    createdAt: now,
                    updatedAt: now,
                });
                const parentRef = db.doc(`parents/${parentUid}`);
                tx.set(parentRef, {
                    uid: parentUid,
                    email: parentEmail,
                    athleteUid: uid,
                    primaryAthleteUid: uid,
                    updatedAt: now,
                }, { merge: true });
            }
            tx.update(intakeRef, {
                status: "approved",
                used: true,
                approved: true,
                approvedUid: uid,
                approvedAt: now,
                minted: true,
                forTrack: prefix,
                forLane: lane,
                trackCode,
                virtueName: vName,
                virtueCode: vCode,
                mintVirtueTagSerial: mintVirtueTag,
                mintVirtueTag: mintVirtueTag,
                parentUid,
                parentEmail,
                parentPhoneDigits,
                parentName,
                legacy: hasLegacy,
                legacyType: hasLegacy ? "external" : null,
                legacyYearsVerified: expPlan.yearsVerified,
                legacyCreditTotal: expPlan.total,
                legacyCreditIssued: expPlan.issuedNow,
                legacyHold: expPlan.hold,
                legacyCreditSchedule: expPlan.schedule,
                legacyNote: expPlan.note,
                adjustmentAmount: hasAdjustment ? adjustmentAmount : 0,
                adjustmentNote,
                updatedAt: now,
            });
            const receiptRef = db.collection("receipts").doc();
            tx.create(receiptRef, {
                type: "MINT_ACTIVATE",
                foundry: prefix,
                counterDoc: counterRef.path,
                allocatedNumber: n,
                uid,
                mintVirtueTag,
                virtue: vName,
                virtueCode: vCode,
                trackCode,
                intakeId,
                lane,
                legacyYearsVerified: expPlan.yearsVerified,
                legacyCreditTotal: expPlan.total,
                legacyCreditIssued: expPlan.issuedNow,
                adjustmentAmount: hasAdjustment ? adjustmentAmount : 0,
                adjustmentNote,
                stripeCount,
                parentUid,
                parentEmail,
                createdAt: now,
            });
            return {
                uid,
                mintVirtueTag,
                allocatedNumber: n,
                receiptId: receiptRef.id,
                parentUid,
                idempotent: false,
            };
        });
        return { ok: true, ...result };
    }
    catch (err) {
        console.error("approveAndActivate crash:", err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", err?.message || String(err));
    }
});
