/* ============================================================
   DIRECTOR — LIVE TEAM SCOREBOARD
   Shows NFHS team race in real time
   ============================================================ */

import { db } from "../firebase-init.js";

const list = document.getElementById("teamBoardList");
const title = document.getElementById("eventTitle");

export function loadTeamBoard(eventId) {
  title.textContent = `Team Scores — ${eventId}`;

  db.collection("teamScores")
    .doc(eventId)
    .collection("teams")
    .orderBy("score", "desc")
    .onSnapshot((snap) => {
      list.innerHTML = "";

      snap.forEach((doc) => {
        const t = doc.data();

        list.innerHTML += `
          <div class="team-row">
            <span class="team-name">${t.name}</span>
            <span class="team-score">${t.score}</span>
          </div>
        `;
      });
    });
}
