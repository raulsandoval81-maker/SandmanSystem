/* ============================================================
   ROUND ROBIN SCORING ENGINE (2026)
   ============================================================ */

import { applyTiebreakers } from "./RRTiebreak.js";

export function processMatch(result, athletes) {
  const { red, green, redScore, greenScore, victoryType } = result;

  const A = athletes.find(a => a.id === red);
  const B = athletes.find(a => a.id === green);

  // Store match result
  A.matchResults[B.id] = { vs: B.id, for: redScore, against: greenScore, victoryType };
  B.matchResults[A.id] = { vs: A.id, for: greenScore, against: redScore, victoryType };

  // Update totals
  A.pointsFor += redScore;    B.pointsFor += greenScore;
  A.pointsAgainst += greenScore; B.pointsAgainst += redScore;

  // Wins/losses
  if (redScore > greenScore) {
    A.wins++; B.losses++;
  } else {
    B.wins++; A.losses++;
  }

  // Victory type breakdown
  const winner = redScore > greenScore ? A : B;

  if (victoryType === "fall")       winner.pins++;
  if (victoryType === "tech")       winner.techs++;
  if (victoryType === "major")      winner.majors++;
  if (victoryType === "decision")   winner.decisions++;

  return applyTiebreakers(athletes);
}
