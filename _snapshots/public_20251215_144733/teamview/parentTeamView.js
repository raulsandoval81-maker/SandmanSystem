import { db } from "../../firebase-init.js";

// URL: /events/teamview/parentTeamView.html?event=12345
const eventId = new URLSearchParams(location.search).get("event");
if (!eventId) {
  document.getElementById("eventTitle").textContent = "Event Not Found";
  throw new Error("Missing event ID in URL");
}

// Set event title live
db.collection("events")
  .doc(eventId)
  .onSnapshot(doc => {
    if (doc.exists) {
      const e = doc.data();
      document.getElementById("eventTitle").textContent =
        e.name || "Team Scoreboard";
    }
  });

// Live scoreboard listener
db.collection("teamScores")
  .doc(eventId)
  .collection("teams")
  .orderBy("score", "desc")
  .onSnapshot((snap) => {
    const box = document.getElementById("teamList");
    box.innerHTML = "";

    snap.forEach((doc) => {
      const t = doc.data();
      box.innerHTML += `
        <div class="team-row">
          <span>${t.name}</span>
          <span>${t.score}</span>
        </div>
      `;
    });
  });

console.log("%cPARENT TEAM SCOREBOARD LIVE", "color:#ffdd48;font-weight:bold;");
