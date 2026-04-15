// public/assets/js/athlete-xp.readonly.js
// Read-only athlete view: latest logs + total. No add/reset/delete.

import { db } from "./firebase-init.js";
import {
  collection as fsCollection,
  getDocs,
  query as fsQuery,
  where as fsWhere,
  orderBy as fsOrderBy,
  limit as fsLimit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const el = (id) => document.getElementById(id);
const XP = () => fsCollection(db, "xp_logs");
const ATH = () => fsCollection(db, "athletes");

// Labels / categories (same as coach pages)
const CATS = [
  "Technique","Competition Day","Discipline","Conditioning",
  "Leadership","Attendance","Extra Merit","Decay"
];

// Bootstrap
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[XP] athlete-xp.readonly.js loaded");
  await fillAthleteSelect();
  wireEvents();
  await refreshUI();
});

function wireEvents() {
  el("athleteSelect").addEventListener("change", refreshUI);
  el("loadLatestBtn").addEventListener("click", refreshUI);
}

// Fill athlete dropdown (sorted by name)
async function fillAthleteSelect() {
  const snap = await getDocs(fsQuery(ATH()));
  const items = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (a.name||"").localeCompare(b.name||""));

  const s = el("athleteSelect");
  s.innerHTML = items.map(a =>
    `<option value="${escapeHtml(a.name||"")}">${escapeHtml(a.name||"")}</option>`
  ).join("");

  // If nothing yet, add a placeholder
  if (!s.value) {
    s.innerHTML = `<option value="">(no athletes)</option>`;
  }
}

// Fetch + render
async function refreshUI() {
  const name = el("athleteSelect").value;
  await Promise.all([renderFeed(name), renderTotal(name)]);
}

async function renderFeed(name, count = 10) {
  const mount = el("xp-feed");
  if (!mount) return;

  if (!name) {
    mount.innerHTML = `<div class="xp-card muted">No athlete selected.</div>`;
    return;
  }

  // index-friendly query: athlete == name, orderBy createdAt desc, limit
  // If you haven't created the composite index yet, you can temporarily
  // omit orderBy and sort client-side.
  let docs = [];
  try {
    const q = fsQuery(
      XP(),
      fsWhere("athlete", "==", name),
      fsOrderBy("createdAt", "desc"),
      fsLimit(count)
    );
    const snap = await getDocs(q);
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Fallback: no index — pull subset and sort client-side
    const snap = await getDocs(fsQuery(XP(), fsWhere("athlete","==",name)));
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, count);
  }

  if (!docs.length) {
    mount.innerHTML = `<div class="xp-card muted">No XP yet.</div>`;
    return;
  }

  mount.innerHTML = docs.map(d => {
    const when = d.createdAt?.toDate ? d.createdAt.toDate() : null;
    const date = when ? when.toLocaleString() : "";
    const points = Number(d.points || 0);
    const cat = d.category && CATS.includes(d.category) ? d.category : (d.category || "");
    const note = d.note ? `<div class="muted">${escapeHtml(d.note)}</div>` : "";
    return `
      <div class="xp-card">
        <div class="gold"><strong>${escapeHtml(name)}</strong></div>
        <div><strong>${points >= 0 ? points : points} XP</strong> ${cat ? `(${escapeHtml(cat)})` : ""}</div>
        <small class="muted">${escapeHtml(date)}</small>
        ${note}
      </div>
    `;
  }).join("");
}

async function renderTotal(name) {
  const mount = el("xp-totals");
  if (!mount) return;

  if (!name) { mount.textContent = ""; return; }

  // Simple sum over logs for this athlete
  const snap = await getDocs(fsQuery(XP(), fsWhere("athlete","==",name)));
  const total = snap.docs.reduce((sum, doc) => sum + Number(doc.data().points || 0), 0);

  mount.innerHTML = `
    <div class="xp-card strong">Total (${escapeHtml(name)}): ${total} XP</div>
  `;
}

// Utility
function escapeHtml(s="") {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  })[m]);
}
