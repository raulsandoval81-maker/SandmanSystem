/* ============================================================
   SCORING ENGINE — 2026 MASTER VERSION
   Clean, unified, future-proof.
   Drives Table Console, Mat Console, Director, Scoreboards.
============================================================ */

export const scoringState = {
  red: 0,
  green: 0,
  period: 1,
  matchOver: false,
};

// unified event log (filmroom reads from this)
export const eventLog = [];

// ============================================================
// FIRE AN EVENT
// ============================================================
export function fireEvent(packet) {
  if (scoringState.matchOver) return;

  const timestamp = window.getVideoTime?.() || null;
  const now = Date.now();

  const ev = {
    ...packet,
    ts: now,
    videoTime: timestamp
  };

  eventLog.push(ev);

  // scoring side
  if (packet.code) applyScore(packet.side, packet.code);

  // state changes
  if (packet.state === "end-match") scoringState.matchOver = true;

  // notify listeners
  if (window.updateScoreUI) window.updateScoreUI();
  if (window.refreshFilmroom) window.refreshFilmroom();
  if (window.directorSync) window.directorSync();

  console.log("[EVENT]", ev);
}

// ============================================================
// APPLY SCORE BASED ON CODE
// ============================================================
function applyScore(side, code) {
  const map = {
    td3: 3,
    esc1: 1,
    rev2: 2,
    nf2: 2,
    nf3: 3,
    nf4: 4,
    "stall1": 1,
    "stall2": 2,
    "illegal": 1,
    "unsport": 1,
    "tech": 1,
    // warnings = no points
    "stall-warn": 0
  };

  const pts = map[code] ?? 0;

  if (pts > 0) {
    scoringState[side] += pts;
  }
}
