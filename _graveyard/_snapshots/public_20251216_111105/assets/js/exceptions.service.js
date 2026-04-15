/* ---------------------------------------------------------------------------
   Sandman Combat System™ — Exceptions Engine (Combat)
   Scope: Youth + Foundry4 (Teen/Adult)
   Storage: localStorage (by athlete + period) until Firebase wiring
--------------------------------------------------------------------------- */

console.log("[exceptions] loaded");

export const EXC_TYPES = {
  normal:              "normal",            // standard add
  academicHonorRoll:   "academicHonorRoll", // per quarter, one-time
  recoveryParticipation:"recoveryParticipation", // weekly cap
  makeupPractice:      "makeupPractice",    // counts as attendance but never extra
  coachMerit:          "coachMerit",        // coach discretion, monthly cap
  digitalAssignments:  "digitalAssignments" // full month complete
};

/* ---- Policy (can tune later) ------------------------------------------- */
const POLICY = {
  ATTENDANCE_WEEKLY_CAP: 30,      // attendance-type cap (makeups respect this)
  ACADEMIC_PER_QUARTER: 150,      // one grant per quarter
  RECOVERY_PER_SESSION: 10,       // recommended award per session while injured
  RECOVERY_WEEKLY_CAP: 60,        // max via recovery in a week
  COACH_MERIT_MONTHLY_CAP: 200,   // coach discretion total per month
  DIGITAL_ASSIGNMENTS_MONTHLY: 40 // all 8 submitted → one grant/mo
};

/* ---- Period helpers ---------------------------------------------------- */
function ymd(d){ return d.toISOString().slice(0,10); }
function weekKey(d=new Date()){
  // ISO week (simple): year + week number
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + (4 - day));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const weekNo = Math.ceil(((dt - yearStart)/86400000 + 1)/7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
}
function monthKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function quarterKey(d=new Date()){
  const q = Math.floor(d.getMonth()/3)+1;
  return `${d.getFullYear()}-Q${q}`;
}

/* ---- Storage (local) --------------------------------------------------- */
function k(base, athleteId, scopeKey){ return `sandman:${base}:${athleteId}:${scopeKey}`; }
function getNum(key){ const v = localStorage.getItem(key); return v ? Number(v) || 0 : 0; }
function setNum(key, n){ localStorage.setItem(key, String(Math.max(0, Math.floor(n)))); }

/* ---- Core API ---------------------------------------------------------- */
/**
 * Compute award and update caps.
 * @param {Object} p
 * @param {string} p.athleteId   e.g., "A000001"
 * @param {string} p.type        EXC_TYPES.*
 * @param {number} p.base        base points (for normal adds)
 * @param {number} [p.amount]    optional requested amount (coach merit)
 * @param {Date}   [p.when]      event datetime
 * @returns {{award:number, note:string}}
 */
export function applyException(p){
  const when = p.when ? new Date(p.when) : new Date();
  const wid  = weekKey(when);
  const mid  = monthKey(when);
  const qid  = quarterKey(when);
  const aid  = (p.athleteId || "anon").trim() || "anon";
  const base = Math.max(0, Number(p.base)||0);
  const type = p.type || EXC_TYPES.normal;

  // Normal add (no caps from this engine)
  if (type === EXC_TYPES.normal){
    return { award: base, note: "normal" };
  }

  // Academic honor roll — one grant per quarter, fixed value
  if (type === EXC_TYPES.academicHonorRoll){
    const key = k("academic", aid, qid);
    const already = getNum(key);
    if (already > 0){
      return { award: 0, note: `academic: already granted this quarter (${qid})` };
    }
    setNum(key, POLICY.ACADEMIC_PER_QUARTER);
    return { award: POLICY.ACADEMIC_PER_QUARTER, note: `academic ${qid}` };
  }

  // Recovery/rehab participation — per-session award, weekly cap
  if (type === EXC_TYPES.recoveryParticipation){
    const wkKey = k("recovery", aid, wid);
    const used = getNum(wkKey);
    const remaining = Math.max(0, POLICY.RECOVERY_WEEKLY_CAP - used);
    const grant = Math.min(remaining, POLICY.RECOVERY_PER_SESSION);
    if (grant <= 0){
      return { award: 0, note: `recovery: weekly cap reached (${POLICY.RECOVERY_WEEKLY_CAP})` };
    }
    setNum(wkKey, used + grant);
    return { award: grant, note: `recovery ${wid} (+${grant}/${POLICY.RECOVERY_WEEKLY_CAP})` };
  }

  // Makeup practice — allowed but never exceeds weekly attendance cap
  if (type === EXC_TYPES.makeupPractice){
    const wkKey = k("attendance", aid, wid);
    const used = getNum(wkKey);
    const remaining = Math.max(0, POLICY.ATTENDANCE_WEEKLY_CAP - used);
    const grant = Math.min(remaining, base); // base often 10/15; use your page’s base
    if (grant <= 0){
      return { award: 0, note: `makeup: no remaining attendance capacity this week` };
    }
    setNum(wkKey, used + grant);
    return { award: grant, note: `makeup ${wid} (+${grant}/${POLICY.ATTENDANCE_WEEKLY_CAP})` };
  }

  // Coach merit — discretionary amount, monthly cap
  if (type === EXC_TYPES.coachMerit){
    const requested = Math.max(0, Math.floor(Number(p.amount)||0));
    if (!requested) return { award: 0, note: "coach merit: amount required" };
    const mKey = k("coachMerit", aid, mid);
    const used = getNum(mKey);
    const remaining = Math.max(0, POLICY.COACH_MERIT_MONTHLY_CAP - used);
    const grant = Math.min(remaining, requested);
    if (grant <= 0){
      return { award: 0, note: `coach merit: monthly cap reached (${POLICY.COACH_MERIT_MONTHLY_CAP})` };
    }
    setNum(mKey, used + grant);
    return { award: grant, note: `coach merit ${mid} (+${grant}/${POLICY.COACH_MERIT_MONTHLY_CAP})` };
  }

  // Digital assignments — one grant per month if all submitted
  if (type === EXC_TYPES.digitalAssignments){
    const mKey = k("digital", aid, mid);
    const already = getNum(mKey);
    if (already > 0){
      return { award: 0, note: `digital: already granted for ${mid}` };
    }
    setNum(mKey, POLICY.DIGITAL_ASSIGNMENTS_MONTHLY);
    return { award: POLICY.DIGITAL_ASSIGNMENTS_MONTHLY, note: `digital complete ${mid}` };
  }

  return { award: base, note: "fallback" };
}

/* Convenience: reset caps for testing one athlete */
export function resetCaps(athleteId){
  const prefix = `sandman:`;
  const keys = Object.keys(localStorage);
  keys.forEach(k0=>{
    if (k0.startsWith(prefix) && k0.includes(`:${athleteId}:`)){
      localStorage.removeItem(k0);
    }
  });
  console.log(`[exceptions] caps reset for ${athleteId}`);
}
