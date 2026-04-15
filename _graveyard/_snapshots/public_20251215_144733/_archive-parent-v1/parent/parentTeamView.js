import { db } from "../../firebase-init.js";

const eventId = new URLSearchParams(location.search).get("event");
const listBox = document.getElementById("teamList");
const modal = document.getElementById("teamModal");
const modalName = document.getElementById("modalTeamName");
const modalWeights = document.getElementById("modalWeights");
document.getElementById("closeModal").onclick = () => modal.classList.add("hidden");

// Load event name
db.collection("events").doc(eventId).onSnapshot(doc => {
  if (doc.exists) {
    document.getElementById("eventTitle").textContent = doc.data().name;
  }
});

// TEAM SCOREBOARD
db.collection("teamScores")
  .doc(eventId)
  .collection("teams")
  .orderBy("score", "desc")
  .onSnapshot(snap => {
    listBox.innerHTML = "";

    snap.forEach(doc => {
      const t = doc.data();
      const id = doc.id;

      const momentumWidth = Math.min(100, (t.momentum || 0) * 10);
      const bubbles = (t.record || []).map(r =>
        `<div class="bubble ${r === 'W' ? 'win' : 'loss'}"></div>`
      ).join("");

      listBox.innerHTML += `
        <div class="team-row" data-id="${id}">
          <div class="row-top">
            <span>${t.name}</span>
            <span class="score">${t.score}</span>
          </div>

          <div class="momentum" style="background:linear-gradient(90deg,var(--gold) ${momentumWidth}%, var(--border) ${momentumWidth}%);"></div>

          <div class="bubble-row">
            ${bubbles}
          </div>
        </div>
      `;
    });

    bindTeamRows();
  });

function bindTeamRows() {
  document.querySelectorAll(".team-row").forEach(row => {
    row.onclick = () => {
      const id = row.dataset.id;
      loadTeamDetail(id);
    };
  });
}

function loadTeamDetail(teamId) {
  db.collection("teamScores")
    .doc(eventId)
    .collection("teams")
    .doc(teamId)
    .collection("weights")
    .orderBy("weight", "asc")
    .get()
    .then(snap => {
      modalWeights.innerHTML = "";
      snap.forEach(doc => {
        const w = doc.data();
        modalWeights.innerHTML += `
          <div class="weight-row">
            <strong>${w.weight}</strong>: ${w.result} (${w.points})
          </div>
        `;
      });

      db.collection("teamScores")
        .doc(eventId)
        .collection("teams")
        .doc(teamId)
        .get()
        .then(team => {
          modalName.textContent = team.data().name;
          modal.classList.remove("hidden");
        });
    });
}

console.log("%cADVANCED TEAM SCOREBOARD LIVE", "color:#ffdd48;font-weight:bold;");
