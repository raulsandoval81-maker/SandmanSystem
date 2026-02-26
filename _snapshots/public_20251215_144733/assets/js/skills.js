// /public/assets/js/skills.js
// 5-status skill selector (exclusive). Local cache + optional Firestore save.

import {
  db, doc, setDoc, updateDoc, serverTimestamp, getDoc
} from "./firebase-init.js"; // ok if rules are read-only; toggle SAVE_TO_FIRESTORE below

// Locked status set
const STATUS = Object.freeze({
  decay: "💀", // slipping
  hold:  "✋️", // stand by
  ready: "😎", // ready for test
  fire:  "🔥", // standout day
  na:    "⏳", // not attempted
});

// Flip to true when your rules allow coach writes
const SAVE_TO_FIRESTORE = false;

// ---- Local cache helpers (per athlete+skill)
const keyFor = (athleteId, skillId) => `skill:${athleteId}:${skillId}:status`;
const loadCached = (athleteId, skillId) => localStorage.getItem(keyFor(athleteId, skillId));
const saveCached = (athleteId, skillId, status) => localStorage.setItem(keyFor(athleteId, skillId), status);

// ---- UI: exclusive select within a row
function setActive(rowEl, statusCode) {
  rowEl.querySelectorAll(".emoji").forEach(btn => {
    btn.setAttribute("aria-pressed", btn.dataset.status === statusCode ? "true" : "false");
  });
}

// ---- Firestore persistence (one doc per athlete+skill, with timeline)
async function persist({ athleteId, skillId, skillName, statusCode }) {
  if (!SAVE_TO_FIRESTORE) return { ok: true, skipped: true };
  try {
    const ref = doc(db, "athlete_skills", `${athleteId}__${skillId}`);
    const snap = await getDoc(ref);
    const entry = { t: serverTimestamp(), status: statusCode };
    if (!snap.exists()) {
      await setDoc(ref, {
        athleteId, skillId, skillName,
        lastStatus: statusCode,
        updatedAt: serverTimestamp(),
        timeline: [entry],
      });
    } else {
      const prev = snap.data();
      await updateDoc(ref, {
        lastStatus: statusCode,
        updatedAt: serverTimestamp(),
        timeline: (prev.timeline || []).concat([entry]),
      });
    }
    return { ok: true };
  } catch (e) {
    console.warn("[skills] save error", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// ---- Wire up rows
function init() {
  const statusBar = document.getElementById("status");

  document.querySelectorAll(".row[data-skill-id]").forEach(row => {
    const athleteId = row.dataset.athleteId;
    const skillId   = row.dataset.skillId;
    const skillName = row.dataset.skillName || skillId;

    // restore last local selection
    const last = loadCached(athleteId, skillId);
    if (last && STATUS[last]) setActive(row, last);

    row.addEventListener("click", async (e) => {
      const btn = e.target.closest(".emoji");
      if (!btn) return;

      const chosen = btn.dataset.status;
      if (!STATUS[chosen]) return;

      // UI: exclusive toggle
      setActive(row, chosen);

      // Local cache (instant)
      saveCached(athleteId, skillId, chosen);

      // Optional persistence
      const res = await persist({ athleteId, skillId, skillName, statusCode: chosen });

      if (statusBar) {
        if (res.skipped) {
          statusBar.textContent = `Saved locally: ${skillName} → ${STATUS[chosen]} (${chosen}).`;
        } else if (res.ok) {
          statusBar.textContent = `Saved: ${athleteId} • ${skillName} → ${STATUS[chosen]} (${chosen}).`;
        } else {
          statusBar.textContent = `Failed to save: ${res.error}`;
        }
      }
    });
  });
}

init();
