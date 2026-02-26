// functions/src/callables.ts
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

type Track = "foundry8" | "foundry4";
const TRACKS = new Set<Track>(["foundry8", "foundry4"]);

function assertStr(name: string, v: unknown) {
  if (typeof v !== "string" || !v.trim()) throw new HttpsError("invalid-argument", `${name} is required`);
}
const monthKey = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// --- ROLE FOR MONTH ----------------------------------------------------------
/**
 * setRoleForMonth({ uid, track, mk?, role })  role: "athlete" | "leader"
 * Writes:
 *   athletes/{uid}/months/{mk} => { track, role }
 * Also mirrors role into leaderboard athlete doc for quick filtering:
 *   leaderboards/{track}/months/{mk}/athletes/{uid} => { role }
 */
export const setRoleForMonth = onCall(async (req) => {
  const { uid, track, mk, role } = req.data || {};
  assertStr("uid", uid);
  assertStr("track", track);
  assertStr("role", role);
  if (!TRACKS.has(track)) throw new HttpsError("invalid-argument", "unknown track");
  if (!["athlete", "leader"].includes(role)) throw new HttpsError("invalid-argument", "role must be athlete|leader");
  const month = mk && /^\d{4}-\d{2}$/.test(mk) ? mk : monthKey();

  const athleteMonthRef = db.doc(`athletes/${uid}/months/${month}`);
  const lbAthleteRef = db.doc(`leaderboards/${track}/months/${month}/athletes/${uid}`);

  const now = FieldValue.serverTimestamp();
  await Promise.all([
    athleteMonthRef.set({ uid, track, role, updatedAt: now }, { merge: true }),
    lbAthleteRef.set({ uid, track, mk: month, role, updatedAt: now }, { merge: true }),
  ]);

  return { ok: true, uid, track, mk: month, role };
});

// Convenience wrapper used by the Tester “Enroll / Unenroll” buttons
export const setLeadershipForMonth = onCall(async (req) => {
  const { uid, track, mk, enabled } = req.data || {};
  const role = enabled ? "leader" : "athlete";
  return setRoleForMonth.run({ data: { uid, track, mk, role } } as any);
});

// --- TIER WRITE --------------------------------------------------------------
/**
 * setTierForMonth({ uid, track, tier })
 * Writes current tier (string like "T0".."T8") under:
 *   athletes/{uid} => { tiers: { [track]: { tier, updatedAt } } }
 * Also logs to rankLogs collection:
 *   rankLogs/{autoId} => { uid, track, tier, delta: 0, at }
 */
export const setTierForMonth = onCall(async (req) => {
  const { uid, track, tier } = req.data || {};
  assertStr("uid", uid);
  assertStr("track", track);
  assertStr("tier", tier);
  if (!TRACKS.has(track)) throw new HttpsError("invalid-argument", "unknown track");
  if (!/^T\d+$/.test(tier)) throw new HttpsError("invalid-argument", "tier must look like T0..T8");

  const athleteRef = db.doc(`athletes/${uid}`);
  const logRef = db.collection("rankLogs").doc();
  const now = FieldValue.serverTimestamp();

  await Promise.all([
    athleteRef.set({ tiers: { [track]: { tier, updatedAt: now } } }, { merge: true }),
    logRef.set({ uid, track, tier, delta: 0, at: now }),
  ]);

  return { ok: true, uid, track, tier };
});

// --- TIER BUMP (±1) ----------------------------------------------------------
/**
 * bumpTierForMonth({ uid, track, delta })  delta = +1 or -1
 * Reads current tier from athletes/{uid}.tiers[track].tier and bumps within [T0..T8].
 */
export const bumpTierForMonth = onCall(async (req) => {
  const { uid, track, delta } = req.data || {};
  assertStr("uid", uid);
  assertStr("track", track);
  if (!TRACKS.has(track)) throw new HttpsError("invalid-argument", "unknown track");
  const d = Number(delta);
  if (![1, -1].includes(d)) throw new HttpsError("invalid-argument", "delta must be +1 or -1");

  const athleteRef = db.doc(`athletes/${uid}`);
  const snap = await athleteRef.get();
  const current = snap.get(`tiers.${track}.tier`) as string | undefined;

  const currentNum = current && /^T\d+$/.test(current) ? Number(current.slice(1)) : 0;
  // bounds: Foundry 8 supports up to T8; Foundry 4 up to T4
  const max = track === "foundry8" ? 8 : 4;
  const nextNum = Math.min(max, Math.max(0, currentNum + d));
  const nextTier = `T${nextNum}`;

  const now = FieldValue.serverTimestamp();
  const logRef = db.collection("rankLogs").doc();

  await Promise.all([
    athleteRef.set({ tiers: { [track]: { tier: nextTier, updatedAt: now } } }, { merge: true }),
    logRef.set({ uid, track, tier: nextTier, delta: d, at: now }),
  ]);

  return { ok: true, uid, track, from: current || null, to: nextTier };
});
