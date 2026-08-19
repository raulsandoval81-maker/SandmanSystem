// @ts-nocheck
// public/tests/tester.js

// Freeze any error so you can read it
window.onerror = (m, s, l, c, e) => { console.error("window.onerror", m, e); debugger; };
window.onunhandledrejection = (ev) => { console.error("unhandledrejection", ev.reason); debugger; };

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFunctions, connectFunctionsEmulator, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// ---- Firebase init (Functions emulator) ----
const app = initializeApp({ projectId: "sandmandashboard" });
const functions = getFunctions(app);
connectFunctionsEmulator(functions, "127.0.0.1", 5001); // change port if your emulator banner shows different

// Callable exported by your functions code (onCall)
const incXP = httpsCallable(functions, "incrementAttendance"); // server handles all XP rules

// ---- UI elements expected in test-firebase.html ----
// <input id="uid">, <input id="athleteName">, <select id="track">
// buttons: btn-attendance, btn-fish, btn-show,
//          btn-style-shark, btn-style-bull, btn-style-matador,
//          btn-style-snake, btn-style-mongoose, btn-style-gorilla
const $ = (id) => document.getElementById(id);
const uidEl   = $("#uid");
const nameEl  = $("#athleteName");
const trackEl = $("#track");
const statusEl = $("#status") || (() => {
  const d = document.createElement("div");
  d.id = "status";
  d.style.marginTop = "12px";
  d.style.color = "#9ca3af";
  document.body.appendChild(d);
  return d;
})();

const setStatus = (msg, ok=null) => {
  statusEl.textContent = msg;
  statusEl.style.color = ok === true ? "#22c55e" : ok === false ? "#ef4444" : "#9ca3af";
};

// Core call to server
async function logXP(group, key, xp, label) {
  const uid = (uidEl?.value || "demo-athlete").trim();
  const athleteName = (nameEl?.value || "Demo Athlete").trim();
// tester.js
const track = (trackEl?.value || "foundry8").trim();

  const payload = { uid, athleteName, track, rule: { group, key, xp, label } };

  try {
    setStatus(`Calling ${group}/${key}…`);
    const res = await incXP(payload);
    const { ok, delta, label: lbl } = res?.data || {};
    setStatus(ok ? `Logged ${lbl || label} (${delta >= 0 ? "+" : ""}${delta})` : "No change", !!ok);
  } catch (e) {
    console.error("XP call failed", e);
    setStatus(`Error: ${e.message || e}`, false);
    debugger; // stops the blink so you can read the error
  }
}

// Wire helpers
const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

// ---- Buttons ----
// Practice
bind("btn-attendance", () => logXP("practice", "attendance", 10, "Attendance +10"));
bind("btn-fish",       () => logXP("practice", "fish",       -5, "Fish -5")); // decay

// Tournament (capped 2/mo on server)
bind("btn-show",       () => logXP("tournament", "show",     15, "Show +15 (cap 2/mo)"));

// Style animals (+5 each, cap 2/mo on server)
bind("btn-style-shark",    () => logXP("style", "shark",    5, "Shark +5"));
bind("btn-style-bull",     () => logXP("style", "bull",     5, "Bull +5"));
bind("btn-style-matador",  () => logXP("style", "matador",  5, "Matador +5"));
bind("btn-style-snake",    () => logXP("style", "snake",    5, "Snake +5"));
bind("btn-style-mongoose", () => logXP("style", "mongoose", 5, "Mongoose +5"));
bind("btn-style-gorilla",  () => logXP("style", "gorilla",  5, "Gorilla +5"));

setStatus("Ready.");
