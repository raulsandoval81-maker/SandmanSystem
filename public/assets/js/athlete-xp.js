/* Athlete XP page logic — offline-first (localStorage).
   Collections (local): xp_entries, athleteLogs, athleteSkills, coachNotes
*/

// 1) Imports
import { db, FIREBASE_OPEN } from "./firebase-init.js";
import {
  collection, addDoc, serverTimestamp,
  getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// 2) LocalStorage helper (LS.get / LS.push / LS.set)
const LS = {
  get: (k, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  },
  push: (k, v) => {
    const arr = LS.get(k, []);
    arr.push(v);
    localStorage.setItem(k, JSON.stringify(arr));
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// 3) Temp dev key (match your Firestore rules)
const DEV_KEY = "SANDBOX123";

/* ----------------- SAVE XP ----------------- */
async function saveXP({ athleteName, sport, category, amount }) {
  const entry = { athleteName, sport, category, amount, createdAt: Date.now() };

  // Always write local
  LS.push("xp_logs", entry);

  // If breaker is on, also write to Firestore
  if (FIREBASE_OPEN && db) {
    try {
      await addDoc(collection(db, "xp_logs"), {
        ...entry,
        createdAt: serverTimestamp(),
        devKey: DEV_KEY,
      });
      console.log("[XP] Saved to Firebase", entry);
    } catch (err) {
      console.warn("[XP] Firebase save failed → local only", err);
    }
  }
}

/* ----------------- LOAD LEADERBOARD ----------------- */
async function loadXPLeaderboard(max = 20) {
  const box = document.getElementById("leaderboard");
  if (!box) return;

  // 1) Local snapshot first
  const localRows = LS.get("xp_logs") || [];
  renderLeaderboard(localRows);

  // 2) If breaker is on → fetch Firebase
  if (FIREBASE_OPEN && db) {
    try {
      const q = query(
        collection(db, "xp_logs"),
        orderBy("createdAt", "desc"),
        limit(max)
      );
      const snap = await getDocs(q);
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      renderLeaderboard(rows);
      console.log("[XP] Leaderboard loaded from Firebase");
    } catch (err) {
      console.warn("[XP] Firebase leaderboard failed", err);
    }
  }
}

function renderLeaderboard(rows) {
  const box = document.getElementById("leaderboard");
  if (!box) return;
  box.innerHTML = rows.map(r =>
    `<div>${r.athleteName ?? "—"} — ${r.amount ?? 0} XP (${r.sport ?? ""})</div>`
  ).join("");
}

/* ----------------- YOUR EXISTING CONSTANTS/UTILS ----------------- */
const KEYS = {
  xp: "xp_entries",        // {name,sport,category,points,ts}
  logs: "athleteLogs",     // {goal,takeaway,timestamp}
  skills: "athleteSkills", // {name,status,timestamp}
  notes: "coachNotes"      // { [name]: [{text,by,at}, ...] }
};

// tiny selectors + read/write used by the rest of your file
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const read  = (k, f = []) => LS.get(k, f);
const write = (k, v)      => LS.set(k, v);

/* ----------------- BOOT ----------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadXPLeaderboard(20);
  // if you also need initial renders for logs/skills/etc, keep your existing calls here
});

/* ----------------- … keep your existing code … ----------------- */
/* (logs, skills, notes, tiers, compare strip, etc.) */

/* ----------------- LADDER SNIPPET (tail fix only) ----------------- */
// ... your helper functions above (totalLadderCap, findTierIndexByXP, tierFor, etc.) ...

function renderLadderSnippet(name){
  const box = document.getElementById('ladderSnippet');
  if (!box) return;
  if (!name){
    box.innerHTML = 'Enter your name above to load.';
    return;
  }

  const total = xp
    .filter(e => (e.name||'').trim()===name)
    .reduce((s,e)=>s+(e.points||0),0);

  if (!TIERS.length){
    box.textContent = 'Ladder unavailable.';
    return;
  }

  const cap = totalLadderCap();
  const pctOverall = cap>0 ? Math.max(0, Math.min(100, Math.round((total/cap)*100))) : 0;
  const curIdx = findTierIndexByXP(total);

  const track = document.createElement('div');
  track.className = 'ladder-track';
  track.style.position = 'relative';

  TIERS.forEach((t, i) => {
    const seg = document.createElement('div');
    seg.className = 'ladder-seg';
    if (i < curIdx) seg.classList.add('past');
    if (i === curIdx) seg.classList.add('current');
    seg.title = `${t.name} • ${t.min} XP`;
    track.appendChild(seg);
  });

  const pin = document.createElement('div');
  pin.className = 'ladder-pin';
  pin.style.position = 'absolute';
  pin.style.top = '-8px';
  pin.style.left = `calc(${pctOverall}% - 6px)`;
  track.appendChild(pin);

  const {cur,next} = tierFor(total);
  const labels = document.createElement('div');
  labels.className = 'ladder-labels';
  labels.innerHTML = `
    <span>Now: <strong>${cur.name}</strong> (${total} XP)</span>
    <span>${next ? `Next: <strong>${next.name}</strong> at ${next.min} XP` : `<strong>Max tier</strong>`}</span>
  `;

  box.innerHTML = '';
  box.appendChild(track);
  box.appendChild(labels);
} // ← fixed: removed stray dot
