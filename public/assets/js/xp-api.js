// public/assets/js/xp-api.js
// Single gateway to the incrementXp callable (back/forward compatible)

import { functions } from "/assets/js/firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const _incrementXp = httpsCallable(functions, "incrementXp");

// Canonical kind names (must match backend)
export const KIND = Object.freeze({
  // Combat
  ATTENDANCE: "ATTENDANCE",

  // Arena
  ARENA_BATTLE: "ARENA/BATTLE",
  ARENA_PODIUM: "ARENA/PODIUM",
  ARENA_STYLEIQ: "ARENA/STYLEIQ",

  // Lanes / contributions
  STRENGTH: "STRENGTH",
  HONOR: "HONOR",

  // DEV / admin kinds (emulator-only on backend)
  DEV_GRIND: "DEV/GRIND",
  DEV_SETXP: "DEV/SETXP",
  DEV_PROMOTE_TIER: "DEV/PROMOTE_TIER",

  // If/when you add these backend-side, wire them here too:
  // DEV_SET_STATUS_COOLDOWN: "DEV/SET_STATUS_COOLDOWN",
  // DEV_SET_STATUS_FREEZE: "DEV/SET_STATUS_FREEZE",
  // DEV_CLEAR_LOCK: "DEV/CLEAR_LOCK",
});

function assertAmount(payload) {
  const k = String(payload.kind || "");

  /* =========================
     DEV kinds
  ========================= */
  if (k.startsWith("DEV/")) {
    if (k === KIND.DEV_SETXP) {
      const amt = Number(payload.amount);
      if (!Number.isFinite(amt)) throw new Error(`${k} amount is required`);
      if (amt < 0) throw new Error(`${k} amount must be >= 0`);
      payload.amount = amt;
      return;
    }

    // Other DEV kinds: amount optional, numeric if present
    if ("amount" in payload && payload.amount !== undefined && payload.amount !== null) {
      const amt = Number(payload.amount);
      if (!Number.isFinite(amt)) throw new Error(`${k} amount must be a number if provided`);
      payload.amount = amt;
    } else {
      delete payload.amount;
    }
    return;
  }

  /* =========================
     Strength / Honor (always +5)
  ========================= */
  if (k === KIND.STRENGTH || k === KIND.HONOR) {
    const amt = Number(payload.amount);
    if (!Number.isFinite(amt)) throw new Error(`${k} amount is required`);
    if (amt !== 5) throw new Error(`${k} amount must be 5`);
    payload.amount = amt;
    return;
  }

  /* =========================
     Arena kinds (amount optional)
  ========================= */
  if (
    k === KIND.ARENA_BATTLE ||
    k === KIND.ARENA_PODIUM ||
    k === KIND.ARENA_STYLEIQ
  ) {
    if ("amount" in payload && payload.amount !== undefined && payload.amount !== null) {
      const amt = Number(payload.amount);
      if (!Number.isFinite(amt)) throw new Error(`${k} amount must be a number if provided`);
      payload.amount = amt;
    }
    return;
  }  
    /* =========================
     Prestige kinds (25/50/75)
  ========================= */
  if (k === "PRESTIGE") {
    const amt = Number(payload.amount);
    if (!Number.isFinite(amt)) throw new Error(`${k} amount is required`);
    if (amt !== 25 && amt !== 50 && amt !== 75) throw new Error(`${k} amount must be 25, 50, or 75`);
    payload.amount = amt;
    return;
  }


  /* =========================
     Everything else (Combat etc.)
     must be 10 or 5
  ========================= */
  const amt = Number(payload.amount);
  if (!Number.isFinite(amt)) throw new Error(`${k} amount is required`);
  if (amt !== 10 && amt !== 5) throw new Error(`${k} amount must be 10 or 5`);
  payload.amount = amt;
}
// --- awardXP: accepts EITHER (uid, payload) OR (payload) ---
export async function awardXP(arg1, arg2) {
  let payload;

  if (typeof arg1 === "string") {
    // old style: (uid, { kind, amount?, note?, meta? })
    const uid = arg1;
    payload = { uid, ...(arg2 || {}) };
  } else {
    // new style: ({ uid, kind, amount?, note?, meta? })
    payload = arg1 || {};
  }

  if (!payload?.uid) throw new Error("awardXP: missing uid");
  if (!payload?.kind) throw new Error("awardXP: missing kind");

  // ✅ enforce amount rules before calling server
  assertAmount(payload);

  const { data } = await _incrementXp(payload);
  return data;
}

/* ===== Attendance (friendly: Full-time / Part-time) ===== */
export const attendanceFull = (uid, note) =>
  awardXP(uid, { kind: KIND.ATTENDANCE, amount: 10, note });

export const attendancePart = (uid, note) =>
  awardXP(uid, { kind: KIND.ATTENDANCE, amount: 5, note });

/* ===== Arena (Battle / Podium / StyleIQ) ===== */
export const arenaBattle = (uid, tournamentId, note) =>
  awardXP({ uid, kind: KIND.ARENA_BATTLE, note, meta: { tournamentId } });

export const arenaPodium = (uid, tournamentId, note) =>
  awardXP({ uid, kind: KIND.ARENA_PODIUM, note, meta: { tournamentId } });

export const arenaStyleIQ = (uid, tournamentId, note) =>
  awardXP({ uid, kind: KIND.ARENA_STYLEIQ, note, meta: { tournamentId } });

/* ===== Generic increment (Strength / Honor + future kinds) ===== */
export const incrementXp = (uid, kind, amount, note = "", meta = undefined) =>
  awardXP({ uid, kind, amount, note, ...(meta ? { meta } : {}) });
