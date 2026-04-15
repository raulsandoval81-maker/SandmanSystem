/* ============================================================
   TEAM SCORE MODEL — Firestore NFHS Team Scoring
   Clean 2026 Build
   ============================================================ */

import { db } from "../firebase-init.js";

export async function pushTeamPoints({ eventId, team, points, victoryType }) {
  const ref = db
    .collection("teamScores")
    .doc(eventId)
    .collection("teams")
    .doc(team);

  await ref.set(
    {
      name: team,
      score: points,
      updatedAt: Date.now(),
      [victoryType]: firebase.firestore.FieldValue.increment(1)
    },
    { merge: true }
  );

  console.log(
    `%cTEAM SCORE UPDATED: ${team} += ${points}`,
    "color:#44ff88;font-weight:bold"
  );
}
