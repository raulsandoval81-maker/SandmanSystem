import { db } from "../firebase-init.js";

const params = new URLSearchParams(location.search);

const eventId   = params.get("event");
const bracketId = params.get("bracket");

const board = document.getElementById("bracketBoard");
const title = document.getElementById("brTitle");
const weight = document.getElementById("brWeight");

// overall header info
db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();

    title.textContent = d.name || "Bracket";
    weight.textContent = d.weight || "";
  });

// matches inside the bracket
db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .collection("matches")
  .orderBy("order")
  .onSnapshot((snap) => {
    board.innerHTML = "";

    snap.forEach(doc => {
      const m = doc.data();

      board.innerHTML += `
        <div class="match-row">
          <div class="ath red">
            <span>${m.redName}</span>
            <span>${m.redScore ?? "-"}</span>
          </div>

          <div class="ath green">
            <span>${m.greenName}</span>
            <span>${m.greenScore ?? "-"}</span>
          </div>

          <div class="status">
            ${m.status || "Pending"}
          </div>
        </div>
      `;
    });
  });
