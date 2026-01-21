// public/assets/js/xp-api.js
// Single gateway to the incrementXp callable (back/forward compatible)

import { functions } from "/assets/js/firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const _incrementXp = httpsCallable(functions, "incrementXp");

// Canonical kind names
export const KIND = Object.freeze({
  ATTENDANCE: "ATTENDANCE",
  ARENA_BATTLE: "ARENA/BATTLE",
  ARENA_PODIUM: "ARENA/PODIUM",
  ARENA_STYLEIQ: "ARENA/STYLEIQ",
});

// ✅ normalize + validate once (top-level)
function assertAmount(payload) {
  if (payload.kind === KIND.ATTENDANCE) {
    const amt = Number(payload.amount);
    if (amt !== 10 && amt !== 5) throw new Error("ATTENDANCE amount must be 10 or 5");
    payload.amount = amt; // normalize
  }
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
