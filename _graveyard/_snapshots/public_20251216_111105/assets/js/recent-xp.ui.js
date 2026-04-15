/* ---------------------------------------------------------------------------
   Recent XP UI (localStorage-backed, last 10 per athlete)
   Usage:
     import { initRecentXp, logRecentXp } from "./recent-xp.ui.js";
     initRecentXp("A000001");           // once per page load
     logRecentXp({ athleteId, xp, tag, note }); // on each add
--------------------------------------------------------------------------- */

const STORE_KEY = (id) => `sandman:recentxp:${id}`;

function readList(athleteId) {
  try {
    const raw = localStorage.getItem(STORE_KEY(athleteId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeList(athleteId, arr) {
  try { localStorage.setItem(STORE_KEY(athleteId), JSON.stringify(arr.slice(0, 10))); }
  catch {}
}

function fmtTime(d) {
  const dd = new Date(d);
  const hh = dd.getHours() % 12 || 12;
  const mm = String(dd.getMinutes()).padStart(2, "0");
  const ap = dd.getHours() >= 12 ? "PM" : "AM";
  return `${hh}:${mm} ${ap}`;
}

function badge(tag) {
  const map = {
    normal:              "bg-gray-700",
    academicHonorRoll:   "bg-amber-700",
    recoveryParticipation:"bg-blue-700",
    makeupPractice:      "bg-slate-700",
    coachMerit:          "bg-red-700",
    digitalAssignments:  "bg-green-700",
  };
  return map[tag] || "bg-gray-700";
}

function render(athleteId) {
  const box = document.getElementById("recentList");
  if (!box) return;
  const items = readList(athleteId);

  box.innerHTML = items.map(item => `
    <div class="recent-row">
      <div class="recent-left">
        <span class="pill ${badge(item.tag)}">+${item.xp} XP</span>
        <span class="tag">${item.tag.replace(/([A-Z])/g," $1")}</span>
        ${item.note ? `<span class="note">— ${item.note}</span>` : ""}
      </div>
      <div class="recent-right">${fmtTime(item.time)}</div>
    </div>
  `).join("") || `<div class="recent-empty">No recent activity yet.</div>`;
}

export function initRecentXp(athleteId = "anon") {
  render(athleteId);
  // expose for debugging
  window._recentXpDebug = {
    dump: () => readList(athleteId),
    clear: () => { localStorage.removeItem(STORE_KEY(athleteId)); render(athleteId); }
  };
}

/** Call this after an add */
export function logRecentXp({ athleteId = "anon", xp = 0, tag = "normal", note = "" }) {
  const list = readList(athleteId);
  list.unshift({ xp: Number(xp)||0, tag, note, time: Date.now() });
  writeList(athleteId, list);
  render(athleteId);
}
