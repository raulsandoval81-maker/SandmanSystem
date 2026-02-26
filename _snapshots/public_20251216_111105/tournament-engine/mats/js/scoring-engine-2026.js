/* ============================================================
   SCORING ENGINE — 2026 (NFHS / NCAA / CP1 / STEP-OUT)
   Sandman Tournament Engine — Unified Logic
   ============================================================ */

import { fireEvent, fireToAll } from "./event-sync.js";

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */
export const scoringState = {
  red: 0,
  green: 0,
  period: 1,
  matchOver: false,
  lastAction: "",
  bout: "--",
  event: "--",
  redName: "RED",
  greenName: "GREEN"
};

/* ------------------------------------------------------------
   POINT MAP (base scoring)
------------------------------------------------------------ */
const scoringMap = {
  td3: 3,
  esc1: 1,
  rev2: 2,
  nf2: 2,
  nf3: 3,
  nf4: 4,
  stall1: 1,
  stall2: 2,
  illegal: 1,
  unsport: 1,
  tech: 1
};

/* ============================================================
   APPLY REGULAR SCORING (TD, ESC, REV, NF)
   ============================================================ */
export function applyScore(side, code) {
  if (scoringState.matchOver) return;

  const pts = scoringMap[code] || 0;

  scoringState[side] += pts;
  scoringState.lastAction = `${side.toUpperCase()} ${code.toUpperCase()} +${pts}`;

  /* Broadcast score update */
  fireToAll({
    type: "score",
    payload: {
      red: scoringState.red,
      green: scoringState.green,
      note: scoringState.lastAction
    }
  });

  /* Local log (table console, filmroom, mat console) */
  fireEvent({
    type: "log",
    text: scoringState.lastAction
  });
}


/* ============================================================
   APPLY PENALTIES
   ============================================================ */
export function applyPenalty(side, penaltyValue) {
  if (!penaltyValue) return;

  // Stall warning = NO points
  if (penaltyValue === "stall-warn") {
    scoringState.lastAction = `${side.toUpperCase()} Stall Warning`;
    fireEvent({ type: "log", text: scoringState.lastAction });
    return;
  }

  const pts = scoringMap[penaltyValue] || 0;
  scoringState[side] += pts;

  scoringState.lastAction = `${side.toUpperCase()} ${penaltyValue.toUpperCase()} +${pts}`;

  fireToAll({
    type: "score",
    payload: {
      red: scoringState.red,
      green: scoringState.green,
      note: scoringState.lastAction
    }
  });

  fireEvent({
    type: "log",
    text: scoringState.lastAction
  });
}


/* ============================================================
   CP1 — COMPETITOR POINT (your rule)
   ============================================================ */
export function applyCP1(side) {
  scoringState[side] += 1;

  scoringState.lastAction = `${side.toUpperCase()} CP1 Competitor Point`;

  fireToAll({
    type: "score",
    payload: {
      red: scoringState.red,
      green: scoringState.green,
      note: scoringState.lastAction
    }
  });

  fireEvent({ type: "log", text: scoringState.lastAction });
}


/* ============================================================
   STEP-OUT RULE (Freestyle hybrid)
   ============================================================ */
export function stepOut(offender) {
  const defender = offender === "red" ? "green" : "red";

  scoringState[defender] += 1;

  scoringState.lastAction = `${defender.toUpperCase()} Step-Out +1`;

  fireToAll({
    type: "score",
    payload: {
      red: scoringState.red,
      green: scoringState.green,
      note: scoringState.lastAction
    }
  });

  fireEvent({ type: "log", text: scoringState.lastAction });
}


/* ============================================================
   PERIOD CONTROL
   ============================================================ */
export function nextPeriod() {
  scoringState.period += 1;

  scoringState.lastAction = `PERIOD → ${scoringState.period}`;

  fireToAll({
    type: "period",
    payload: {
      period: scoringState.period,
      note: scoringState.lastAction
    }
  });

  fireEvent({
    type: "log",
    text: scoringState.lastAction
  });
}


/* ============================================================
   END MATCH
   ============================================================ */
export function endMatch() {
  scoringState.matchOver = true;

  scoringState.lastAction = "MATCH ENDED";

  fireToAll({
    type: "end",
    payload: {
      red: scoringState.red,
      green: scoringState.green
    }
  });

  fireEvent({
    type: "log",
    text: "Match Ended"
  });
}


/* ============================================================
   RESET MATCH (not auto-called)
   ============================================================ */
export function resetMatch() {
  scoringState.red = 0;
  scoringState.green = 0;
  scoringState.period = 1;
  scoringState.matchOver = false;
  scoringState.lastAction = "Match Reset";

  fireToAll({
    type: "score",
    payload: {
      red: 0,
      green: 0,
      note: "Match Reset"
    }
  });

  fireEvent({ type: "log", text: "Match Reset" });
}


console.log("%cSCORING ENGINE 2026 READY", "color:#ffdd48;font-weight:bold;");
