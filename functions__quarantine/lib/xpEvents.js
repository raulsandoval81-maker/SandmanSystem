"use strict";
// functions/src/xpEvents.ts
/**
 * XP increment functions (hybrid):
 *  - incrementXp      (onCall, canonical)
 *  - incrementXpHttp  (onRequest + CORS, dev/integration only)
 * Server-side caps + leaderboard mirror.
 * Includes:
 *  - attendance / fish / tournament_show / style / prestige
 *  - character (+5) with leader/non-leader caps
 *  - leadership_allowance (+100) once per month for leaders
 *  - capReason echoed back for the tester UI
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementXpHttp = exports.incrementXp = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const cors_1 = __importDefault(require("cors"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = (0, firestore_1.getFirestore)();
const corsHandler = (0, cors_1.default)({ origin: true });
/* ---------- CONSTANTS ---------- */
const POINTS = {
    attendance: 10,
    fish: -5,
    tournament_show: 15,
    style: 5,
    prestige: 0, // resolved by PRESTIGE_POINTS
    character: 5,
    leadership_allowance: 100,
};
const PRESTIGE_POINTS = {
    lion: 15,
    tiger: 50,
    bear: 100,
};
const ATTENDANCE_XP_CAP = 120; // XP / month
const STYLE_COUNT_CAP = 2; // entries / month
const FISH_COUNT_CAP = 4; // entries / month
const NON_LEADER_CHARACTER_CAP = 4; // entries / month
const LEADER_CHARACTER_CAP = 10; // entries / month
// prestige: once per year per badge
// leadership_allowance: once per month
/* ---------- HELPERS ---------- */
const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const yearFromMk = (mk) => mk.slice(0, 4);
function normalize(input, badge, note) {
    if (typeof input === "object" && input) {
        return {
            type: input.type,
            badge: input.badge ?? badge,
            note: input.note ?? note,
        };
    }
    return { type: input, badge, note };
}
function assertString(name, v) {
    if (typeof v !== "string" || !v.trim())
        throw new https_1.HttpsError("invalid-argument", `${name} is required`);
}
/* ---------- REFS ---------- */
const countersDoc = (track, mk, uid) => db.doc(`leaderboards/${track}/months/${mk}/counters/${uid}`);
const entriesCol = (track, mk) => db.collection(`leaderboards/${track}/months/${mk}/entries`);
const athletesTotalsDoc = (track, mk, uid) => db.doc(`leaderboards/${track}/months/${mk}/athletes/${uid}`);
const prestigeYearDoc = (uid, year) => db.doc(`xpCounters/${uid}/years/${year}`);
const allowanceMonthDoc = (uid, mk) => db.doc(`xpCounters/${uid}/months/${mk}`);
/* ---------- CORE LOGIC ---------- */
async function incrementXpCore(raw) {
    assertString("uid", raw.uid);
    assertString("track", raw.track);
    const uid = raw.uid.trim();
    const track = raw.track.trim();
    const mk = raw.mk && /^\d{4}-\d{2}$/.test(raw.mk) ? raw.mk : monthKey();
    const year = yearFromMk(mk);
    const { type, badge, note } = normalize(raw.type, raw.badge, raw.note);
    if (!type)
        throw new https_1.HttpsError("invalid-argument", "type is required");
    // resolve points
    let points = POINTS[type];
    if (type === "prestige") {
        const b = (badge || "").toLowerCase();
        if (!b || !(b in PRESTIGE_POINTS)) {
            throw new https_1.HttpsError("invalid-argument", "prestige badge is required (lion|tiger|bear)");
        }
        points = PRESTIGE_POINTS[b];
    }
    const cRef = countersDoc(track, mk, uid);
    const aRef = athletesTotalsDoc(track, mk, uid);
    const yRef = prestigeYearDoc(uid, year);
    const mRef = allowanceMonthDoc(uid, mk);
    const eCol = entriesCol(track, mk);
    const result = await db.runTransaction(async (tx) => {
        const [cSnap, aSnap, ySnap, mSnap] = await Promise.all([
            tx.get(cRef),
            tx.get(aRef),
            tx.get(yRef),
            tx.get(mRef),
        ]);
        const counters = cSnap.exists
            ? cSnap.data()
            : {
                mk,
                uid,
                track,
                role: "athlete", // mirror of monthly role
                attendanceXp: 0,
                attendanceCount: 0,
                fishCount: 0,
                tournament_showCount: 0,
                style_bonusCount: 0,
                characterCount: 0,
                monthXp: 0,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
        const athleteTotals = aSnap.exists
            ? aSnap.data()
            : {
                uid,
                track,
                mk,
                totalXp: 0,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
        const yearFlags = ySnap.exists
            ? ySnap.data()
            : { year, prestige: {} };
        const monthFlags = mSnap.exists
            ? mSnap.data()
            : { mk, leadershipAllowanceGiven: false };
        /* ---------- CAPS ---------- */
        let applied = points;
        let capped = false;
        let capReason = null;
        if (type === "attendance") {
            if ((counters.role || "athlete") === "leader") {
                applied = 0;
                capped = true;
                capReason = "role_is_leader";
            }
            else {
                const current = Number(counters.attendanceXp || 0);
                const remaining = ATTENDANCE_XP_CAP - current;
                if (remaining <= 0) {
                    applied = 0;
                    capped = true;
                    capReason = "attendance_cap";
                }
                else if (applied > remaining) {
                    applied = remaining;
                    capReason = "attendance_cap_partial";
                }
            }
        }
        else if (type === "style") {
            const used = Number(counters.style_bonusCount || 0);
            if (used >= STYLE_COUNT_CAP) {
                applied = 0;
                capped = true;
                capReason = "style_cap";
            }
        }
        else if (type === "fish") {
            const used = Number(counters.fishCount || 0);
            if (used >= FISH_COUNT_CAP) {
                applied = 0;
                capped = true;
                capReason = "fish_cap";
            }
        }
        else if (type === "prestige") {
            const bKey = (badge || "").toLowerCase();
            if (yearFlags.prestige?.[bKey]) {
                applied = 0;
                capped = true;
                capReason = "prestige_year";
            }
        }
        else if (type === "character") {
            const isLeader = String(counters.role || "athlete") === "leader";
            const used = Number(counters.characterCount || 0);
            const cap = isLeader ? LEADER_CHARACTER_CAP : NON_LEADER_CHARACTER_CAP;
            if (used >= cap) {
                applied = 0;
                capped = true;
                capReason = "character_cap";
            }
        }
        else if (type === "leadership_allowance") {
            const isLeader = String(counters.role || "athlete") === "leader";
            if (!isLeader || monthFlags.leadershipAllowanceGiven) {
                applied = 0;
                capped = true;
                capReason = "allowance_cap";
            }
        }
        /* ---------- WRITES ---------- */
        const now = firestore_1.FieldValue.serverTimestamp();
        // counters merge (only bump counts if applied !== 0)
        const toMerge = {
            mk,
            uid,
            track,
            monthXp: Number(counters.monthXp || 0) + applied,
            updatedAt: now,
        };
        if (type === "attendance") {
            toMerge.attendanceXp = Number(counters.attendanceXp || 0) + applied;
            toMerge.attendanceCount =
                Number(counters.attendanceCount || 0) + (applied > 0 ? 1 : 0);
        }
        else if (type === "fish") {
            if (applied !== 0)
                toMerge.fishCount = Number(counters.fishCount || 0) + 1;
        }
        else if (type === "tournament_show") {
            if (applied !== 0)
                toMerge.tournament_showCount =
                    Number(counters.tournament_showCount || 0) + 1;
        }
        else if (type === "style") {
            if (applied !== 0)
                toMerge.style_bonusCount = Number(counters.style_bonusCount || 0) + 1;
        }
        else if (type === "character") {
            if (applied !== 0)
                toMerge.characterCount = Number(counters.characterCount || 0) + 1;
        }
        tx.set(cRef, toMerge, { merge: true });
        // immutable entry
        const entry = {
            uid,
            track,
            mk,
            type,
            badge: badge || null,
            note: note || null,
            xp: applied,
            capped,
            capReason, // surfaced by tester
            createdAt: now,
        };
        tx.set(eCol.doc(), entry);
        // leaderboard mirror
        tx.set(aRef, {
            uid,
            track,
            mk,
            totalXp: Number(athleteTotals.totalXp || 0) + applied,
            updatedAt: now,
        }, { merge: true });
        // prestige yearly flags
        if (type === "prestige" && applied > 0) {
            const bKey = (badge || "").toLowerCase();
            const next = { ...(yearFlags.prestige || {}) };
            next[bKey] = true;
            tx.set(yRef, { year, prestige: next, updatedAt: now }, { merge: true });
        }
        // allowance month flag
        if (type === "leadership_allowance" && applied > 0) {
            tx.set(mRef, { mk, leadershipAllowanceGiven: true, updatedAt: now }, { merge: true });
        }
        return { ok: true, applied, capped, capReason, mk };
    });
    return result;
}
/* ---------- EXPORTS ---------- */
// Canonical callable (SDK: httpsCallable("incrementXp"))
exports.incrementXp = (0, https_1.onCall)(async (req) => {
    return incrementXpCore(req.data);
});
// HTTP shim (dev/integration only; CORS-wrapped; guarded in prod)
exports.incrementXpHttp = (0, https_1.onRequest)((req, res) => {
    corsHandler(req, res, async () => {
        try {
            // Guard: allow freely on emulator; require secret header otherwise
            if (process.env.FUNCTIONS_EMULATOR !== "true" &&
                req.headers["x-admin-secret"] !== process.env.XP_HTTP_SECRET) {
                res.status(403).send({ error: "forbidden" });
                return;
            }
            const body = req.body;
            const result = await incrementXpCore(body);
            res.json(result);
        }
        catch (err) {
            console.error("[incrementXpHttp] ERROR:", err);
            res.status(500).send({ error: err?.message || "internal" });
        }
    });
});
