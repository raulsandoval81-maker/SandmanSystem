import { db } from "../../firebase-init.js";

const eventId = new URLSearchParams(location.search).get("event");
const bracketId = new URLSearchParams(location.search).get("bracket");
const box = document.getElementById("bracketBox");

db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .onSnapshot(doc => {
    if (!doc.exists) return;

    const b = doc.data();
    document.getElementById("bracketTitle").textContent = b.name;

    renderMatches(b);
  });

function renderMatches(bracket) {
  box.innerHTML = "";

  bracket.matches.forEach(m => {
    box.innerHTML += `
      <div class="match">
        <div class="names">
          <span>${m.red}</span>
          <span class="score">${m.redScore ?? "-"}</span>
        </div>

        <div class="names">
          <span>${m.green}</span>
          <span class="score">${m.greenScore ?? "-"}</span>
        </div>

        <button class="watch" onclick="openFilmroom(${m.mat}, ${m.matchId})">
          Watch Mat ${m.mat}
        </button>
      </div>
    `;
  });
}

window.openFilmroom = function(mat, matchId) {
  window.location.href = `/filmroom/filmroom.html?mat=${mat}&match=${matchId}`;
};

console.log("%cPARENT BRACKET LIVE", "color:#ffdd48;font-weight:bold;");
