/* ============================================================
   BUTTON MAP — 2026
   Unified Scoring Actions for Mat Console PRO
   Maps UI buttons → scoring-engine-2026.js functions
   ============================================================ */

import { 
  applyScore, 
  applyPenalty, 
  applyCP1,
  stepOut,
  nextPeriod,
  endMatch 
} from "./scoring-engine-2026.js";

import { fireToAll } from "./event-sync.js";

/* ============================================================
   1) SCORING BUTTONS (TD / ESC / REV / NF)
   ============================================================ */

document.querySelectorAll(".score-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const side = btn.dataset.side;
    const code = btn.dataset.code;

    if (!side || !code) return;

    applyScore(side, code);
  });
});


/* ============================================================
   2) PENALTY SELECT (Dropdown)
   ============================================================ */

document.querySelectorAll(".penalty-select").forEach(select => {
  select.addEventListener("change", () => {
    const side = select.dataset.side;
    const value = select.value;

    if (!side || !value) return;

    applyPenalty(side, value);

    // Reset dropdown so repeat penalties can fire again
    setTimeout(() => select.value = "", 150);
  });
});


/* ============================================================
   3) CP1 — Competitor Point
   ============================================================ */

document.querySelectorAll("[data-cp1]").forEach(btn => {
  btn.addEventListener("click", () => {
    const side = btn.dataset.cp1;
    applyCP1(side);
  });
});


/* ============================================================
   4) STEP-OUT RULE
   ============================================================ */

document.querySelectorAll("[data-stepout]").forEach(btn => {
  btn.addEventListener("click", () => {
    const offender = btn.dataset.stepout;
    stepOut(offender);
  });
});


/* ============================================================
   5) PERIOD CONTROL
   ============================================================ */

const nextPeriodBtn = document.getElementById("nextPeriodBtn");
if (nextPeriodBtn) {
  nextPeriodBtn.addEventListener("click", () => {
    nextPeriod();
  });
}


/* ============================================================
   6) MATCH END
   ============================================================ */

const endMatchBtn = document.getElementById("endMatchBtn");
if (endMatchBtn) {
  endMatchBtn.addEventListener("click", () => {
    endMatch();
  });
}


/* ============================================================
   7) BOUT SHEET CHOICES
      (T / B / N / D / O)
   ============================================================ */

document.querySelectorAll("[data-choose]").forEach(btn => {
  btn.onclick = () => {
    const choice = btn.dataset.choose;

    fireToAll({
      type: "boutsheet",
      payload: {
        cell: btn.closest(".choice-cell")?.id || "",
        choice
      }
    });
  };
});


/* ============================================================
   8) TIMER EVENTS (for Director & Table Console sync)
   ============================================================ */

document.querySelectorAll(".start").forEach(btn => {
  btn.onclick = () => {
    fireToAll({ type: "clock-control", payload: { action: "start" } });
  };
});

document.querySelectorAll(".pause").forEach(btn => {
  btn.onclick = () => {
    fireToAll({ type: "clock-control", payload: { action: "pause" } });
  };
});

document.querySelectorAll(".reset").forEach(btn => {
  btn.onclick = () => {
    fireToAll({ type: "clock-control", payload: { action: "reset" } });
  };
});


/* ============================================================
   9) LOGGING BUTTONS
   ============================================================ */

document.querySelectorAll("[data-log]").forEach(btn => {
  btn.onclick = () => {
    const text = btn.dataset.log;

    fireToAll({
      type: "log",
      payload: { text }
    });
  };
});


console.log("%cBUTTON MAP 2026 READY", "color:#00ffa2;font-weight:bold;");
