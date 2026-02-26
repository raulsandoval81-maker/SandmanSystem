/* ============================================================
   TABLE CONSOLE — 2026 ENGINE
   Sandman System™ — Master Table View
   Mirrors Mat Console PRO in real time
   ============================================================ */

console.log("%cTABLE CONSOLE 2026 — READY", "color:#00f2ff;font-weight:bold;");

import { freezeVideo, resumeVideo, getVideoTimestamp } from "./filmroomButtons.js";

/* ------------------------------------------------------------
   GLOBAL DOM HOOKS
------------------------------------------------------------ */
const layout       = document.querySelector(".layout-split");
const leftPanel    = document.getElementById("left-panel");
const rightPanel   = document.getElementById("right-panel");
const logWrap      = document.getElementById("log-wrapper");
const consoleWrap  = document.getElementById("console-wrapper");
const sheetSection = document.getElementById("boutsheet-section");
const logBox       = document.getElementById("active-log");
const jumpButtons  = document.getElementById("jumpButtons");

/* ------------------------------------------------------------
   VIEW SWITCHER
------------------------------------------------------------ */
document.querySelectorAll(".view-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.view;
    switchView(mode);
  });
});

function switchView(mode) {
  layout.classList.remove("full-left", "full-right", "split-70");

  if (mode === "sheet") {
    layout.classList.add("full-left");
    logWrap.classList.add("hidden");
    consoleWrap.classList.remove("hidden");
  }

  if (mode === "log") {
    layout.classList.add("full-right");
    consoleWrap.classList.add("hidden");
    logWrap.classList.remove("hidden");
  }

  if (mode === "split") {
    layout.classList.add("split-70");
    consoleWrap.classList.remove("hidden");
    logWrap.classList.remove("hidden");
  }
}

/* ============================================================
   TABLE CONSOLE RECEIVER (Mirror Engine Ready)
   window.tableMirrorPush(eventObj)
------------------------------------------------------------ */
window.tableMirrorPush = function(event) {
  if (!event || !event.type) return;

  switch (event.type) {

    case "score":
      updateScore(event.payload);
      break;

    case "clock":
      updateClock(event.payload);
      break;

    case "special":
      updateSpecial(event.payload);
      break;

    case "log":
      pushLog(event.payload.text);
      break;

    case "boutsheet":
      updateBoutsheet(event.payload);
      break;

    case "match-info":
      updateMatchInfo(event.payload);
      break;

    default:
      console.warn("Unknown table-mirror event:", event);
  }
};

/* ============================================================
   SCORE
------------------------------------------------------------ */
function updateScore(p) {
  if (!p) return;
  document.getElementById("redScore").textContent   = p.red;
  document.getElementById("greenScore").textContent = p.green;
}

/* ============================================================
   CLOCK
------------------------------------------------------------ */
function updateClock(p) {
  if (!p) return;
  document.getElementById("mainTimer").textContent = p.time;
}

/* ============================================================
   SPECIAL TIMERS (Ref / Blood / Injury)
------------------------------------------------------------ */
function updateSpecial(p) {
  if (!p || !p.id) return;
  const el = document.getElementById(p.id);
  if (el) el.textContent = p.value;
}

/* ============================================================
   BOUTSHEET CELLS
------------------------------------------------------------ */
function updateBoutsheet(p) {
  const cell = document.getElementById(p.cell);
  if (!cell) return;

  cell.classList.remove("red-choice", "green-choice");

  if (p.color === "red") cell.classList.add("red-choice");
  if (p.color === "green") cell.classList.add("green-choice");
}

/* ============================================================
   MATCH HEADER INFO
------------------------------------------------------------ */
function updateMatchInfo(info) {
  if (info.event) document.getElementById("eventName").textContent = info.event;
  if (info.mat)   document.getElementById("matNumber").textContent  = info.mat;
  if (info.bout)  document.getElementById("boutNumber").textContent = info.bout;
}

/* ============================================================
   LOG
------------------------------------------------------------ */
function pushLog(text) {
  if (!text || !logBox) return;

  const div = document.createElement("div");
  div.className = "log-row";
  div.textContent = text;

  logBox.prepend(div);
}

/* ============================================================
   FILMROOM JUMP BUTTONS (Auto-generated)
------------------------------------------------------------ */
export function refreshFilmroomButtons(events) {
  if (!jumpButtons) return;

  jumpButtons.innerHTML = "";

  events.forEach((ev, i) => {
    const btn = document.createElement("button");
    btn.className = "jump-btn";
    btn.textContent = `${ev.code || ev.action} @ ${formatTime(ev.videoTime)}`;
    btn.onclick = () => {
      const vid = document.getElementById("matchVideo");
      if (vid) {
        vid.currentTime = ev.videoTime;
        vid.play();
      }
    };
    jumpButtons.appendChild(btn);
  });
}

function formatTime(sec) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
