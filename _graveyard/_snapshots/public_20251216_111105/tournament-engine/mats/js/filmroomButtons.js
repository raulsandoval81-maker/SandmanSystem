/* ============================================================
   FILMROOM JUMP ENGINE — 2026
   Creates jump buttons from the unified EventLog
============================================================ */

console.log("%cFILMROOM READY (2026)", "color:#98ff66;font-weight:bold;");

// global reference populated by mat-console-pro.js
import { eventLog } from "./event-logger.js";

const jumpBox = document.getElementById("jumpButtons");
const video = document.getElementById("matchVideo");

// ------------------------------------------------------------
// SAFETY CHECKS
// ------------------------------------------------------------
if (!jumpBox) console.warn("[Filmroom] Missing #jumpButtons");
if (!video) console.warn("[Filmroom] Missing #matchVideo");

// ============================================================
// HELPER — Format seconds into m:ss
// ============================================================
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ============================================================
// MAIN ENTRY — Called after every eventLog push
// mat-console-pro.js calls:  if (window.refreshFilmroom) window.refreshFilmroom()
// ============================================================
window.refreshFilmroom = function () {
  if (!jumpBox) return;

  jumpBox.innerHTML = ""; // clear

  // Build unique cleaned events
  const clean = eventLog.filter(ev => 
    ev.videoTime !== null &&
    ev.videoTime !== undefined &&
    !isNaN(ev.videoTime)
  );

  clean.forEach((ev, index) => {
    const btn = document.createElement("button");
    btn.classList.add("jump-btn");

    const t = fmt(ev.videoTime);

    // label depends on mode
    let label = `${t}`;
    if (ev.code) {
      label = `${t} – ${ev.code.toUpperCase()}`;
    }
    if (ev.mode === "special") {
      label = `${t} – ${ev.type.toUpperCase()} (${ev.action})`;
    }

    btn.textContent = label;

    btn.onclick = () => {
      try {
        video.currentTime = ev.videoTime;
        video.play();
      } catch (err) {
        console.warn("Video not loaded yet, retrying...");
      }
    };

    jumpBox.appendChild(btn);
  });
};

// First load
window.refreshFilmroom();
