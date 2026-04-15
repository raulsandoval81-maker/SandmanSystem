"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpTierForMonth = exports.setTierForMonth = exports.setLeadershipForMonth = exports.setRoleForMonth = void 0;
// functions/src/callables.ts
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./infra/admin");
const TRACKS_IN = new Set(["foundry8", "foundry4", "F8", "F4"]);
function normalizeTrack(t) {
    const raw = (t || "").trim();
    if (!TRACKS_IN.has(raw)) {
        throw new https_1.HttpsError("invalid-argument", "unknown track");
    }
    return raw === "F8" ? "foundry8" : raw === "F4" ? "foundry4" : raw;
}
function assertStr(name, v) {
    if (typeof v !== "string" || !v.trim()) {
        throw new https_1.HttpsError("invalid-argument", `${name} is required`);
    }
}
const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
// --- ROLE FOR MONTH ----------------------------------------------------------
/**
 * setRoleForMonth({ uid, track, mk?, role })  role: "athlete" | "leader"
 * Writes:
 *   athletes/{uid}/months/{mk} => { track, role }
 * Also mirrors role into leaderboard athlete doc for quick filtering:
 *   leaderboards/{track}/months/{mk}/athletes/{uid} => { role }
 */
exports.setRoleForMonth = (0, https_1.onCall)(async (req) => {
    const { uid, track, mk, role } = req.data || {};
    assertStr("uid", uid);
    assertStr("track", track);
    assertStr("role", role);
    const trackNorm = normalizeTrack(track);
    if (!["athlete", "leader"].includes(role)) {
        throw new https_1.HttpsError("invalid-argument", "role must be athlete|leader");
    }
    const month = mk && /^\d{4}-\d{2}$/.test(mk) ? mk : monthKey();
    const athleteMonthRef = admin_1.db.doc(`athletes/${uid}/months/${month}`);
    const lbAthleteRef = admin_1.db.doc(`leaderboards/${trackNorm}/months/${month}/athletes/${uid}`);
    const now = admin_1.FieldValue.serverTimestamp();
    await Promise.all([
        athleteMonthRef.set({ uid, track: trackNorm, role, updatedAt: now }, { merge: true }),
        lbAthleteRef.set({ uid, track: trackNorm, mk: month, role, updatedAt: now }, { merge: true }),
    ]);
    return { ok: true, uid, track: trackNorm, mk: month, role };
});
// Convenience wrapper used by the Tester “Enroll / Unenroll” buttons
exports.setLeadershipForMonth = (0, https_1.onCall)(async (req) => {
    const { uid, track, mk, enabled } = req.data || {};
    const role = enabled ? "leader" : "athlete";
    return exports.setRoleForMonth.run({ data: { uid, track, mk, role } });
});
// --- TIER WRITE --------------------------------------------------------------
/**
 * setTierForMonth({ uid, track, tier })
 * Writes current tier (string like "T0".."T8") under:
 *   athletes/{uid} => { tiers: { [track]: { tier, updatedAt } } }
 * Also logs to rankLogs collection:
 *   rankLogs/{autoId} => { uid, track, tier, delta: 0, at }
 */
exports.setTierForMonth = (0, https_1.onCall)(async (req) => {
    const { uid, track, tier } = req.data || {};
    assertStr("uid", uid);
    assertStr("track", track);
    assertStr("tier", tier);
    const trackNorm = normalizeTrack(track);
    if (!/^T\d+$/.test(tier)) {
        throw new https_1.HttpsError("invalid-argument", "tier must look like T0..T8");
    }
    const athleteRef = admin_1.db.doc(`athletes/${uid}`);
    const logRef = admin_1.db.collection("rankLogs").doc();
    const now = admin_1.FieldValue.serverTimestamp();
    await Promise.all([
        athleteRef.set({ tiers: { [trackNorm]: { tier, updatedAt: now } } }, { merge: true }),
        logRef.set({ uid, track: trackNorm, tier, delta: 0, at: now }),
    ]);
    return { ok: true, uid, track: trackNorm, tier };
});
// --- TIER BUMP (±1) ----------------------------------------------------------
/**
 * bumpTierForMonth({ uid, track, delta })  delta = +1 or -1
 * Reads current tier from athletes/{uid}.tiers[track].tier and bumps within [T0..T8].
 */
exports.bumpTierForMonth = (0, https_1.onCall)(async (req) => {
    const { uid, track, delta } = req.data || {};
    assertStr("uid", uid);
    assertStr("track", track);
    const trackNorm = normalizeTrack(track);
    const d = Number(delta);
    if (![1, -1].includes(d)) {
        throw new https_1.HttpsError("invalid-argument", "delta must be +1 or -1");
    }
    const athleteRef = admin_1.db.doc(`athletes/${uid}`);
    const snap = await athleteRef.get();
    const current = snap.get(`tiers.${trackNorm}.tier`);
    const currentNum = current && /^T\d+$/.test(current) ? Number(current.slice(1)) : 0;
    // bounds: Foundry 8 supports up to T8; Foundry 4 up to T4
    const max = trackNorm === "foundry8" ? 8 : 4;
    const nextNum = Math.min(max, Math.max(0, currentNum + d));
    const nextTier = `T${nextNum}`;
    const now = admin_1.FieldValue.serverTimestamp();
    const logRef = admin_1.db.collection("rankLogs").doc();
    await Promise.all([
        athleteRef.set({ tiers: { [trackNorm]: { tier: nextTier, updatedAt: now } } }, { merge: true }),
        logRef.set({ uid, track: trackNorm, tier: nextTier, delta: d, at: now }),
    ]);
    return { ok: true, uid, track: trackNorm, from: current || null, to: nextTier };
});
