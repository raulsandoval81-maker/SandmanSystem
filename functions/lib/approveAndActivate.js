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
function pad4(n) {
    return String(n).padStart(4, "0");
}
exports.approveAndActivate = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Sign-in required");
    }
    try {
        const input = req.data;
        if (!input?.intakeId ||
            !input?.foundry ||
            !input?.virtueName ||
            !input?.virtueCode ||
            !input?.trackCode) {
            throw new https_1.HttpsError("invalid-argument", "Missing required fields");
        }
        const { intakeId, foundry: foundryRaw, virtueName, virtueCode, trackCode, fullName, publicName, } = input;
        const foundry = String(foundryRaw || "").trim().toLowerCase();
        if (foundry !== "f4" && foundry !== "f8") {
            throw new https_1.HttpsError("invalid-argument", `Invalid foundry: ${foundryRaw}`);
        }
        const counterRef = db.doc(`counters/${foundry}`);
        const intakeRef = db.doc(`intakes/${intakeId}`);
        const result = await db.runTransaction(async (tx) => {
            // ---------------- READS FIRST ----------------
            const intakeSnap = await tx.get(intakeRef);
            if (!intakeSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", `Submission doc missing: ${intakeRef.path}`);
            }
            const intakeData = intakeSnap.data() || {};
            const loc = (intakeData.location || {});
            const teamName = String(loc.team || "").trim() || null;
            const cityName = String(loc.city || "").trim() || null;
            const stateCode = String(loc.state || "").trim().toUpperCase().slice(0, 2) || null;
            const teamId = String(loc.teamId || "").trim() || null;
            // ✅ IDEMPOTENT EXIT:
            // If already approved, return same uid + mint tag and DO NOT touch counters.
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
            // Exp guard (optional)
            const exp = intakeSnap.get("exp");
            if (typeof exp === "number" && exp < Date.now()) {
                throw new https_1.HttpsError("failed-precondition", "Submission expired");
            }
            // Allow only submitted → approve
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
            // Build UID + tags
            const prefix = foundry.toUpperCase(); // "F4" | "F8"
            const uid = `${prefix}_${pad4(n)}`;
            const vName = String(virtueName || "").trim().toUpperCase();
            const vCode = String(virtueCode || "").trim().toUpperCase();
            // V1 legacy tag format (keep stable)
            const mintVirtueTag = `${prefix}_CB${pad4(n)}_${vName}`;
            const athleteRef = db.doc(`athletes/${uid}`);
            const athleteSnap = await tx.get(athleteRef);
            if (athleteSnap.exists) {
                throw new https_1.HttpsError("already-exists", `Athlete already exists: ${uid}`);
            }
            // ---------------- WRITES AFTER READS ----------------
            const now = firestore_1.FieldValue.serverTimestamp();
            // increment counter
            tx.update(counterRef, { next: n + 1 });
            // create athlete (canonical)
            tx.create(athleteRef, {
                uid,
                uidCode: uid,
                tier: "T0",
                track: trackCode,
                trackCode,
                // ✅ server-truth location from intake.location.*
                team: teamName,
                teamId: teamId,
                city: cityName,
                state: stateCode,
                virtue: vName,
                virtueName: vName,
                virtueCode: vCode,
                mintVirtueTag,
                // ✅ mirror to avoid blanks/mismatch
                mintVirtueTagDisplay: mintVirtueTag,
                xp: 0,
                stripeCount: 0,
                xpSource: "intake",
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
            // ✅ Stamp intake with everything the review page needs later
            tx.update(intakeRef, {
                status: "approved",
                used: true,
                approved: true,
                approvedUid: uid,
                approvedAt: now,
                minted: true,
                forTrack: prefix, // "F8" | "F4"
                forLane: "CB",
                trackCode,
                virtueName: vName,
                virtueCode: vCode,
                mintVirtueTagSerial: mintVirtueTag,
                mintVirtueTag: mintVirtueTag,
                updatedAt: now,
            });
            // receipt (optional)
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
                createdAt: now,
            });
            return {
                uid,
                mintVirtueTag,
                allocatedNumber: n,
                receiptId: receiptRef.id,
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
