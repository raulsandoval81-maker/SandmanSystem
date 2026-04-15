/* -----------------------------------------------------------------------------
   Sandman Combat System™ — XP UI Bundle
   Includes:
     - Exceptions Engine (caps & special awards)
     - Recent XP UI (local cache + renderer)
     - wireXpTools() helper to attach Add/Load handlers in one call
   IDs expected in the page (same as your current tools panel):
     #athleteId #xp #category #addXpBtn #loadTotalBtn
     #xpType #coachMeritAmount
     #recentList (container to show recent adds)
     #totalXp (optional live total label)
----------------------------------------------------------------------------- */

/* ========== Exceptions Engine ============================================ */
export const EXC_TYPES = {
  normal:               "normal",
  academicHonorRoll:    "academicHonorRoll",    // per quarter, one-time
  recoveryParticipation:"recoveryParticipation",// per session, weekly cap
  makeupPractice:       "makeupPractice",       // allowed, respects weekly attendance cap
  coachMerit:           "coachMerit",           // discretionary, monthly cap
  digitalAssignments:   "digitalAssignments"    // once per month if all complete
};

const POLICY = {
  ATTENDANCE_WEEKLY_CAP: 30,
  ACADEMIC_PER_QUARTER: 150,
  RECOVERY_PER_SESSION: 10,
  RECOVERY_WEEKLY_CAP: 60,
  COACH_MERIT_MONTHLY_CAP: 200,
  DIGITAL_ASSIGNMENTS_MONTHLY: 40
};

// period helpers
function weekKey(d=new Date()){
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + (4 - day));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const weekNo = Math.ceil(((dt - yearStart)/86400000 + 1)/7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
}
function monthKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function quarterKey(d=new Date()){ const q=Math.floor(d.getMonth()/3)+1; return `${d.getFullYear()}-Q${q}`; }

// storage helpers
function k(base, athleteId, scopeKey){ return `sandman:${base}:${athleteId}:${scopeKey}`; }
function getNum(key){ const v = localStorage.getItem(key); return v ? Number(v) || 0 : 0; }
function setNum(key, n){ localStorage.setItem(key, String(Math.max(0, Math.floor(n)))); }

/** Core: compute award for an exception and persist cap usage. */
export function applyException({ athleteId="anon", type="normal", base=0, amount=0, when=new Date() } = {}){
  const aid = (athleteId||"anon").trim() || "anon";
  const t = type || EXC_TYPES.normal;
  const basePts = Math.max(0, Number(base)||0);
  const ts = new Date(when);
  const wid = weekKey(ts), mid = monthKey(ts), qid = quarterKey(ts);

  if (t === EXC_TYPES.normal) {
    return { award: basePts, note: "normal" };
  }
  if (t === EXC_TYPES.academicHonorRoll){
    const key = k("academic", aid, qid);
    if (getNum(key) > 0) return { award: 0, note: `academic already (${qid})` };
    setNum(key, POLICY.ACADEMIC_PER_QUARTER);
    return { award: POLICY.ACADEMIC_PER_QUARTER, note: `academic ${qid}` };
  }
  if (t === EXC_TYPES.recoveryParticipation){
    const used = getNum(k("recovery", aid, wid));
    const rem = Math.max(0, POLICY.RECOVERY_WEEKLY_CAP - used);
    const grant = Math.min(rem, POLICY.RECOVERY_PER_SESSION);
    if (grant <= 0) return { award: 0, note: `recovery cap ${POLICY.RECOVERY_WEEKLY_CAP}` };
    setNum(k("recovery", aid, wid), used + grant);
    return { award: grant, note: `recovery ${wid} (+${grant}/${POLICY.RECOVERY_WEEKLY_CAP})` };
  }
  if (t === EXC_TYPES.makeupPractice){
    const used = getNum(k("attendance", aid, wid));
    const rem = Math.max(0, POLICY.ATTENDANCE_WEEKLY_CAP - used);
    const grant = Math.min(rem, basePts);
    if (grant <= 0) return { award: 0, note: "attendance cap reached" };
    setNum(k("attendance", aid, wid), used + grant);
    return { award: grant, note: `makeup ${wid} (+${grant}/${POLICY.ATTENDANCE_WEEKLY_CAP})` };
  }
  if (t === EXC_TYPES.coachMerit){
    const req = Math.max(0, Math.floor(Number(amount)||0));
    if (!req) return { award: 0, note: "coach merit: amount required" };
    const used = getNum(k("coachMerit", aid, mid));
    const rem = Math.max(0, POLICY.COACH_MERIT_MONTHLY_CAP - used);
    const grant = Math.min(rem, req);
    if (grant <= 0) return { award: 0, note: `coach merit cap ${POLICY.COACH_MERIT_MONTHLY_CAP}` };
    setNum(k("coachMerit", aid, mid), used + grant);
    return { award: grant, note: `coach merit ${mid} (+${grant}/${POLICY.COACH_MERIT_MONTHLY_CAP})` };
  }
  if (t === EXC_TYPES.digitalAssignments){
    const key = k("digital", aid, mid);
    if (getNum(key) > 0) return { award: 0, note: `digital already (${mid})` };
    setNum(key, POLICY.DIGITAL_ASSIGNMENTS_MONTHLY);
    return { award: POLICY.DIGITAL_ASSIGNMENTS_MONTHLY, note: `digital ${mid}` };
  }
  return { award: basePts, note: "fallback" };
}

export function resetCaps(athleteId){
  const prefix = "sandman:";
  Object.keys(localStorage).forEach(key=>{
    if (key.startsWith(prefix) && key.includes(`:${athleteId}:`)) localStorage.removeItem(key);
  });
  console.log(`[exceptions] caps reset for ${athleteId}`);
}

/* ========== Recent XP UI ================================================ */
const RECENT_KEY = (id) => `sandman:recentxp:${id}`;
function readRecent(id){ try{ const r=localStorage.getItem(RECENT_KEY(id)); const a=r?JSON.parse(r):[]; return Array.isArray(a)?a:[]; }catch{return [];} }
function writeRecent(id, arr){ try{ localStorage.setItem(RECENT_KEY(id), JSON.stringify(arr.slice(0,10))); }catch{} }
function fmtTime(d){ const dd=new Date(d); const h=dd.getHours()%12||12; const m=String(dd.getMinutes()).padStart(2,"0"); return `${h}:${m} ${dd.getHours()>=12?"PM":"AM"}`; }
function colorClass(tag){
  return ({
    normal:"bg-gray-700",
    academicHonorRoll:"bg-amber-700",
    recoveryParticipation:"bg-blue-700",
    makeupPractice:"bg-slate-700",
    coachMerit:"bg-red-700",
    digitalAssignments:"bg-green-700"
  })[tag] || "bg-gray-700";
}
function renderRecentBox(athleteId){
  const box = document.getElementById("recentList");
  if (!box) return;
  const items = readRecent(athleteId);
  box.innerHTML = items.map(it=>`
    <div class="recent-row">
      <div class="recent-left">
        <span class="pill ${colorClass(it.tag)}">+${it.xp} XP</span>
        <span class="tag">${String(it.tag).replace(/([A-Z])/g,' $1')}</span>
        ${it.note ? `<span class="note">— ${it.note}</span>`:""}
      </div>
      <div class="recent-right">${fmtTime(it.time)}</div>
    </div>
  `).join("") || `<div class="recent-empty">No recent activity yet.</div>`;
}
export function initRecentXp(athleteId="anon"){
  renderRecentBox(athleteId);
  window._recentXp = {
    dump: () => readRecent(athleteId),
    clear: () => { localStorage.removeItem(RECENT_KEY(athleteId)); renderRecentBox(athleteId); }
  };
}
export function logRecentXp({ athleteId="anon", xp=0, tag="normal", note="" } = {}){
  const list = readRecent(athleteId);
  list.unshift({ xp:Number(xp)||0, tag, note, time: Date.now() });
  writeRecent(athleteId, list);
  renderRecentBox(athleteId);
}

/* ========== One-call wiring helper ====================================== */
/**
 * Wires the Tools panel: reads inputs, applies exception policy,
 * updates your total, repaints the bar, and logs the Recent list.
 * Supply tiny adapters for total & repaint so this stays generic.
 */
export function wireXpTools({ repaint, getTotal, setTotal } = {}){
  const addBtn   = document.getElementById("addXpBtn");
  const loadBtn  = document.getElementById("loadTotalBtn");
  const xpInput  = document.getElementById("xp");
  const totalEl  = document.getElementById("totalXp");
  const athleteEl= document.getElementById("athleteId");
  const typeEl   = document.getElementById("xpType");
  const meritEl  = document.getElementById("coachMeritAmount");

  function athleteId(){ return (athleteEl?.value || "A000001").trim(); }

  // init recent box for current athlete
  initRecentXp(athleteId());

  // reflect total immediately (if caller provides it)
  if (totalEl && typeof getTotal === "function") totalEl.textContent = String(getTotal());

  addBtn && addBtn.addEventListener("click", () => {
    const aid  = athleteId();
    const raw  = parseInt(xpInput?.value||"0",10) || 0;
    const type = typeEl?.value || EXC_TYPES.normal;
    const amt  = parseInt(meritEl?.value||"0",10) || 0;

    const { award, note } = applyException({ athleteId: aid, type, base: raw, amount: amt, when: new Date() });

    // Update total via adapter
    const current = typeof getTotal === "function" ? Number(getTotal())||0 : 0;
    const next = Math.max(0, current + award);
    if (typeof setTotal === "function") setTotal(next);
    if (totalEl) totalEl.textContent = String(next);

    // repaint via adapter
    if (typeof repaint === "function") repaint(next);

    // recent log
    logRecentXp({ athleteId: aid, xp: award, tag: type, note });

    console.log(`[xp] +${award} via ${type} (${note}) → total ${next}`);
  });

  loadBtn && loadBtn.addEventListener("click", () => {
    if (typeof repaint === "function" && typeof getTotal === "function") {
      repaint(getTotal());
    }
  });

  // If athlete ID changes mid-session, refresh Recent box
  athleteEl && athleteEl.addEventListener("change", () => initRecentXp(athleteId()));
}

/* ========== Minimal CSS injection (optional) ============================= */
/* If your page doesn't have recent styles, inject a tiny set once. */
(function ensureRecentStyles(){
  if (document.getElementById("recent-xp-styles")) return;
  const css = `
  .recent-box{padding:10px 12px;display:grid;gap:10px}
  .recent-row{display:flex;align-items:center;justify-content:space-between;background:#171a1f;border-radius:10px;padding:10px 12px;box-shadow:inset 0 0 0 1px #262b33}
  .recent-left{display:flex;gap:8px;align-items:center;color:#d7dde5}
  .recent-right{color:#9aa3af;font-weight:600;letter-spacing:.2px}
  .pill{color:#fff;padding:2px 8px;border-radius:999px;font-weight:700;font-size:.9rem}
  .bg-gray-700{background:#374151}.bg-amber-700{background:#92400e}
  .bg-blue-700{background:#1d4ed8}.bg-slate-700{background:#334155}
  .bg-red-700{background:#b91c1c}.bg-green-700{background:#15803d}
  .recent-empty{color:#9aa3af;font-style:italic}
  .tag{color:#e5e7eb;opacity:.9;font-weight:600}
  .note{color:#9aa3af}`;
  const s = document.createElement("style");
  s.id = "recent-xp-styles"; s.textContent = css;
  document.head.appendChild(s);
})();
