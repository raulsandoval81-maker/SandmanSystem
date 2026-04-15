// public/assets/js/athlete-xp.view.js
// Read-only Athlete XP view (feed + totals + coach notes)

import { db } from './firebase-init.js';

import {
  collection as fsCollection,
  getDocs,
  query as fsQuery,
  where as fsWhere,
  orderBy as fsOrderBy,
  limit as fsLimit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// -----------------------------
// Helpers / config
// -----------------------------
const el = (id) => document.getElementById(id);
const XP_COLL = () => fsCollection(db, "xp_logs");
const ATH_COLL = () => fsCollection(db, "athletes");

function fmtDate(ts) {
  try { return ts?.toDate().toLocaleString(); } catch { return ""; }
}

// -----------------------------
// Rendering
// -----------------------------
function renderFeed(items) {
  const mount = el("xp-feed");
  if (!mount) return;
  if (!items.length) {
    mount.innerHTML = `<div class="xp-card muted">No XP yet.</div>`;
    return;
  }
  mount.innerHTML = items.map(d => {
    const date = fmtDate(d.createdAt);
    const who  = d.athlete || "N/A";
    const pts  = d.points ?? d.xp ?? 0;
    const cat  = d.category ? ` (${d.category})` : "";
    const note = d.note ? `<div class="muted">${d.note}</div>` : "";
    return `
      <div class="xp-card">
        <div class="gold"><strong>${who}</strong></div>
        <div><strong>${pts} XP</strong>${cat}</div>
        <small>${date}</small>
        ${note}
      </div>
    `;
  }).join("");
}

function renderTotals(total, athleteLabel) {
  const mount = el("xp-totals");
  if (!mount) return;
  const who = athleteLabel || "All";
  mount.innerHTML = `
    <div class="xp-card strong">Total (${who}): ${total} XP</div>
  `;
}

function renderNotes(notes) {
  const list = el("coach-notes");
  const empty = el("coach-notes-empty");
  if (!list || !empty) return;

  if (!notes.length) {
    list.innerHTML = "";
    empty.textContent = "No coach notes yet.";
    return;
  }

  empty.textContent = "";
  list.innerHTML = notes.map(n => {
    const date = fmtDate(n.createdAt);
    const who  = n.athlete || "N/A";
    return `
      <div class="note-card">
        <strong>${who}</strong>
        <small>${date}</small>
        <div>${n.note}</div>
      </div>
    `;
  }).join("");
}

// -----------------------------
// Data fetchers (read-only)
// -----------------------------
async function fetchAthletes() {
  // Prefer the dedicated athletes collection if present; fallback to distinct names in logs later if needed
  const q = fsQuery(ATH_COLL(), fsOrderBy("name", "asc"), fsLimit(100));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchLatestXP(currentAthlete, count = 10) {
  const parts = [fsOrderBy("createdAt", "desc"), fsLimit(count)];
  if (currentAthlete && currentAthlete !== "All") {
    parts.unshift(fsWhere("athlete", "==", currentAthlete));
  }
  const snap = await getDocs(fsQuery(XP_COLL(), ...parts));
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchTotalXP(currentAthlete) {
  const parts = [fsOrderBy("createdAt", "desc"), fsLimit(1000)];
  if (currentAthlete && currentAthlete !== "All") {
    parts.unshift(fsWhere("athlete", "==", currentAthlete));
  }
  const snap = await getDocs(fsQuery(XP_COLL(), ...parts));
  let total = 0;
  snap.forEach(d => { const v = d.data().points ?? d.data().xp ?? 0; total += (Number(v) || 0); });
  return total;
}

async function fetchCoachNotes(currentAthlete, lookback = 50) {
  // Avoid '!=' filters to skip composite index requirements: fetch latest and filter client-side
  const parts = [fsOrderBy("createdAt", "desc"), fsLimit(lookback)];
  if (currentAthlete && currentAthlete !== "All") {
    parts.unshift(fsWhere("athlete", "==", currentAthlete));
  }
  const snap = await getDocs(fsQuery(XP_COLL(), ...parts));
  const rows = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => (d.note ?? "").trim().length > 0);
  return rows;
}

// -----------------------------
// UI wiring
// -----------------------------
async function populateAthleteSelect() {
  const sel = el("athleteSelect");
  if (!sel) return;

  sel.innerHTML = `<option>Loading…</option>`;
  let list = [];
  try {
    list = await fetchAthletes();
  } catch {
    // If athlete collection doesn't exist yet, fall back to just "All"
    list = [];
  }

  const options = [
    `<option value="All">All</option>`,
    ...list.map(a => `<option value="${a.name}">${a.name}</option>`)
  ].join("");

  sel.innerHTML = options;
}

async function refreshUI() {
  const sel = el("athleteSelect");
  const current = sel?.value || "All";

  const [items, total, notes] = await Promise.all([
    fetchLatestXP(current, 10),
    fetchTotalXP(current),
    fetchCoachNotes(current, 50),
  ]);

  renderFeed(items);
  renderTotals(total, current);
  renderNotes(notes);
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[XP] athlete-xp.view.js loaded");

  await populateAthleteSelect();
  await refreshUI();

  el("athleteSelect")?.addEventListener("change", refreshUI);
  el("loadLatestBtn")?.addEventListener("click", refreshUI);
});
