/* ============================================================
   MAT CONSOLE PRO — 2026 FINAL
   Sandman Tournament Engine (Mat-Side)
   ------------------------------------------------------------
   Handles:
   - Local score logic
   - Timer engine
   - Special times (Ref / Blood / Injury)
   - Bout Sheet choices
   - Action log
   - Broadcast to: Table, Director, Parents
   ============================================================ */

import {
  scoringState,
  applyScore,
  applyPenalty,
  applyCP1,
  stepOut,
  nextPeriod,
  endMatch
} from "../../tournament-engine/scoring-engine-2026.js";

import {
  fireEvent,
  fireToAll,
  sendMatchInfo,
  sendClockUpdate,
  sendBoutSheetEvent,
  registerMat
} from "../../tournament-engine/event-sync.js";

import { buttonMap } from "../../tournament-engine/button-map-2026.js";


/* ============================================================
   1) MAT REGISTRATION
   ============================================================ */
const urlParams = new URLSearchParams(location.search);
const matNumber = urlParams.get("mat") || 1;
registerMat(matNumber);


/* ============================================================
   2) PANEL SWITCHING
   ============================================================ */
document.querySelectorAll(".view-switch button").forEach(btn => {
  btn.onclick = () => {
    const target = btn.dataset.panel;
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById(target).classList.add("active");
  };
});


/* ============================================================
   3) TIMER ENGINE (MAIN PERIOD CLOCK)
   ============================================================ */

let timer = null;
let timeLeft = 120;  // default 2:00

const mainTimerDisplay = document.getElementById("mainTimer");
const giantTimer = document.getElementById("giantTimer");

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateClockDisplays() {
  const t = formatTime(timeLeft);
  mainTimerDisplay.textContent = t;
  if (giantTimer) giantTimer.textContent = t;
  sendClockUpdate(t);
}

function tick() {
  if (timeLeft > 0) {
    timeLeft--;
    updateClockDisplays();
  } else {
    clearInterval(timer);
    timer = null;
  }
}

document.querySelector(".start").onclick = () => {
  if (!timer) timer = setInterval(tick, 1000);
};

document.querySelector(".pause").onclick = () => {
  clearInterval(timer);
  timer = null;
};

document.querySelector(".reset").onclick = () => {
  clearInterval(timer);
  timer = null;
  timeLeft = 120;
  updateClockDisplays();
};


/* ============================================================
   4) SCORING BUTTONS
   ============================================================ */
document.querySelectorAll("[data-code]").forEach(btn => {
  btn.onclick = () => {
    const side = btn.dataset.side;
    const code = btn.dataset.code;
    applyScore(side, code);

    document.getElementById("redScore").textContent = scoringState.red;
    document.getElementById("greenScore").textContent = scoringState.green;

    fireToAll({
      type: "score",
      payload: {
        red: scoringState.red,
        green: scoringState.green,
        text: scoringState.lastAction
      }
    });

    localLog(scoringState.lastAction);
  };
});


/* ============================================================
   5) PENALTIES
   ============================================================ */
document.querySelectorAll(".penalty-select").forEach(sel => {
  sel.onchange = () => {
    const side = sel.dataset.side;
    applyPenalty(side, sel.value);

    document.getElementById("redScore").textContent = scoringState.red;
    document.getElementById("greenScore").textContent = scoringState.green;

    fireToAll({
      type: "score",
      payload: {
        red: scoringState.red,
        green: scoringState.green,
        text: scoringState.lastAction
      }
    });

    localLog(scoringState.lastAction);
    sel.value = "";
  };
});


/* ============================================================
   6) BOUT SHEET CHOICES
   ============================================================ */
document.querySelectorAll("[data-choose]").forEach(btn => {
  btn.onclick = () => {
    const choice = btn.dataset.choose;
    const cell = btn.closest(".choice-cell")?.previousElementSibling?.textContent || "R1";

    sendBoutSheetEvent(cell, "red", choice);
    localLog(`BoutSheet: ${cell} → ${choice.toUpperCase()}`);
  };
});


/* ============================================================
   7) SPECIAL TIMES (Ref, Blood, Injury)
   ============================================================ */
document.querySelectorAll(".t-row").forEach(row => {
  const disp = row.querySelector(".t-val");
  let sec = convertToSec(disp.textContent);

  function convertToSec(str) {
    const [m, s] = str.split(":").map(Number);
    return m * 60 + s;
  }

  function update() {
    disp.textContent = formatTime(sec);
    fireEvent({
      type: "special",
      payload: {
        id: disp.id,
        value: disp.textContent
      }
    });
  }

  // No buttons here; simple local-only timer system for now
});


/* ============================================================
   8) ACTION LOG
   ============================================================ */
const logBox = document.getElementById("logBox");

function localLog(text) {
  const div = document.createElement("div");
  div.className = "log-row";
  div.textContent = text;
  logBox.prepend(div);
}

window.localLogPush = (ev) => {
  if (ev.text) localLog(ev.text);
};


/* ============================================================
   9) MATCH INFO PUSH (ON LOAD)
   ============================================================ */

sendMatchInfo({
  event: scoringState.event,
  bout: scoringState.bout,
  redName: scoringState.redName,
  greenName: scoringState.greenName
});


console.log("%cMAT CONSOLE PRO READY (2026)", "color:#ffdd48;font-weight:bold;");
