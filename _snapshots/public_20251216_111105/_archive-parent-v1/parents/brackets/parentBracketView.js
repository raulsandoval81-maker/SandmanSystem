import { db } from "../../firebase-init.js";

// --------------------------
// URL QUERY PARAMETERS
// --------------------------
const params = new URLSearchParams(location.search);
const eventId = params.get("event");
const bracketId = params.get("bracket");

db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .collection("matches")
  .orderBy("matchId")
  .onSnapshot(snap => {
    const box = document.getElementById("bracketBox");
    box.innerHTML = "";

    snap.forEach(doc => {
      const m = doc.data();

      box.innerHTML += `
        <div class="match-row">
          <div>${m.red}</div>
          <div>${m.green}</div>
          <div>${m.scoreRed}-${m.scoreGreen}</div>
          <div>${m.result}</div>
        </div>
      `;
    });
  });
// --------------------------
// LOAD EVENT + BRACKET TITLE
// --------------------------
db.collection("events").doc(eventId).get().then(doc => {
  if (doc.exists) {
    document.getElementById("eventName").textContent = doc.data().name;
  }
});

// --------------------------
// LIVE BRACKET LISTENER
// --------------------------
db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .onSnapshot(doc => {
    if (!doc.exists) return;

    const data = doc.data();
    document.getElementById("bracketTitle").textContent = data.title || bracketId;

    if (data.type === "roundrobin") {
      renderRoundRobin(data);
    } else if (data.type === "bracketbuster") {
      renderBracket(data);
    }
  });

// ---------------------------------------------------------------
// RENDER ROUND ROBIN POOL
// ---------------------------------------------------------------
function renderRoundRobin(pool) {
  const wrap = document.getElementById("bracketContainer");
  wrap.innerHTML = "";

  let html = `
    <table class="rr-table">
      <thead>
        <tr>
          <th>Athlete</th>
          <th>W</th>
          <th>L</th>
          <th>PF</th>
          <th>PA</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
  `;

  pool.standings.forEach(row => {
    html += `
      <tr>
        <td>${row.name}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.pf}</td>
        <td>${row.pa}</td>
        <td>${row.pf - row.pa}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  wrap.innerHTML = html;
}

// ---------------------------------------------------------------
// RENDER BRACKET BUSTER (SINGLE OR DOUBLE ELIMINATION)
// ---------------------------------------------------------------
function renderBracket(bracket) {
  const wrap = document.getElementById("bracketContainer");
  wrap.innerHTML = "";

  // Example loop for rounds
  ["round1", "round2", "finals"].forEach(round => {
    if (!bracket[round]) return;

    wrap.innerHTML += `<h3>${round.toUpperCase()}</h3>`;

    bracket[round].forEach(match => {
      wrap.innerHTML += `
        <div class="bracket-round">
          <div class="bracket-match">
            <span class="name ${match.winner === 'red' ? 'winner' : ''}">
              ${match.redName || "—"}
            </span>
            <span>${match.redScore ?? ""}</span>
          </div>

          <div class="bracket-match">
            <span class="name ${match.winner === 'green' ? 'winner' : ''}">
              ${match.greenName || "—"}
            </span>
            <span>${match.greenScore ?? ""}</span>
          </div>
        </div>
      `;
    });
  });
}

console.log("%cPARENT BRACKET VIEW READY","color:#ffdd48;font-weight:bold;");
