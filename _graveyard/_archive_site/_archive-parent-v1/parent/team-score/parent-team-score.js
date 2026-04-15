import { db } from "../firebase-init.js";

const params = new URLSearchParams(location.search);
const eventId = params.get("event");

// DOM references
const redNameEl    = document.getElementById("redTeamName");
const greenNameEl  = document.getElementById("greenTeamName");
const redScoreEl   = document.getElementById("redTeamScore");
const greenScoreEl = document.getElementById("greenTeamScore");
const boutFeedEl   = document.getElementById("boutFeed");

// Listen to team scoreboard doc
db.collection("events")
  .doc(eventId)
  .collection("dual")
  .doc("teamScore")
  .onSnapshot((doc) => {
    if (!doc.exists) return;
    const d = doc.data();

    redNameEl.textContent    = d.redTeam;
    greenNameEl.textContent  = d.greenTeam;

    redScoreEl.textContent   = d.redScore;
    greenScoreEl.textContent = d.greenScore;
  });

// Listen to bout result feed
db.collection("events")
  .doc(eventId)
  .collection("dual")
  .doc("teamScore")
  .collection("bouts")
  .orderBy("ts", "desc")
  .onSnapshot((snap) => {
    boutFeedEl.innerHTML = "";

    snap.forEach((doc) => {
      const b = doc.data();

      boutFeedEl.innerHTML += `
        <div>
          <strong>${b.weight}</strong> — 
          ${b.winner.toUpperCase()} (${b.method.toUpperCase()})
          <span style="opacity: .6; margin-left: 8px;">
            +${b.points}pts
          </span>
        </div>
      `;
    });
  });
