/* ============================================================
   MAT CONSOLE PRO — TEAM SCORING ENGINE (NFHS)
   Clean 2026 Build
   ============================================================ */

import { pushTeamPoints } from "../teamScoreModel.js";

/**
 * Called when coach selects the winner.
 * @param {string} winner - "red" or "green"
 * @param {string} victoryType - "fall" | "tech" | "major" | "decision" | "forfeit"
 */
export function applyTeamScore(winner, victoryType) {

  const NFHS_POINTS = {
    fall: 6,
    dq: 6,
    forfeit: 6,
    default: 6,
    tech: 5,
    major: 4,
    decision: 3
  };

  const pts = NFHS_POINTS[victoryType] || 0;

  if (!window.currentEventId) {
    console.warn("⚠ No eventId set for team scoring");
    return;
  }

  const team =
    winner === "red"
      ? window.redTeamName || "RED"
      : window.greenTeamName || "GREEN";

  pushTeamPoints({
    eventId: window.currentEventId,
    team,
    points: pts,
    victoryType
  });

  console.log(
    `%cTEAM SCORE APPLIED → ${team} +${pts} (${victoryType.toUpperCase()})`,
    "color:#00ffaa;font-weight:bold"
  );
}
