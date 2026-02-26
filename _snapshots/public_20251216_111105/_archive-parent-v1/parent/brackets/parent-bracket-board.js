import { db } from "../firebase-init.js";

const eventId = new URLSearchParams(location.search).get("event");
const bracketId = new URLSearchParams(location.search).get("bracket");

const bracketTitle = document.getElementById("bracketTitle");
const bracketMeta = document.getElementById("bracketMeta");
const container = document.getElementById("bracketContainer");

/* -----------------------------
   1) Load Bracket Metadata
----------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .onSnapshot((doc) => {
    if (!doc.exists) return;

    const data = doc.data();

    bracketTitle.textContent = data.name || "Bracket";
    bracketMeta.textContent = `${data.type || "Bracket"} · ${data.weight || ""}`;
  });

/* -----------------------------
   2) Live Matches
----------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .collection("matches")
  .orderBy("order") // ensures correct match sequence
  .onSnapshot((snap) => {
    container.innerHTML = "";

    let currentRound = "";

    snap.forEach((doc) => {
      const m = doc.data();

      // Round header
      if (m.round !== currentRound) {
        currentRound = m.round;
        container.innerHTML += `
          <div class="round-title">${m.round}</div>
        `;
      }

      const redWin = m.redScore > m.greenScore;
      const greenWin = m.greenScore > m.redScore;

      container.innerHTML += `
        <div class="match">
          <div class="label">Match ${m.matchNumber}</div>

          <div class="fighter">
            <span class="${redWin ? 'winner' : 'loser'}">${m.redName}</span>
            <span>${m.redScore}</span>
          </div>

          <div class="fighter">
            <span class="${greenWin ? 'winner' : 'loser'}">${m.greenName}</span>
            <span>${m.greenScore}</span>
          </div>
        </div>
      `;
    });
  });
/* ============================================================
   RR STANDINGS ENGINE — LIVE
============================================================ */
function calculateRRStandings(matches) {
  const athletes = {};

  // Build athlete objects
  matches.forEach(m => {
    if (!athletes[m.redName]) athletes[m.redName] = { name: m.redName, w: 0, l: 0, pf: 0, pa: 0, pd: 0 };
    if (!athletes[m.greenName]) athletes[m.greenName] = { name: m.greenName, w: 0, l: 0, pf: 0, pa: 0, pd: 0 };

    // Add scoring
    const R = athletes[m.redName];
    const G = athletes[m.greenName];

    R.pf += m.redScore;
    R.pa += m.greenScore;
    G.pf += m.greenScore;
    G.pa += m.redScore;

    // Wins + Losses
    if (m.redScore > m.greenScore) {
      R.w++; G.l++;
    } else if (m.greenScore > m.redScore) {
      G.w++; R.l++;
    }
  });

  // Calculate differential
  Object.values(athletes).forEach(a => {
    a.pd = a.pf - a.pa;
  });

  // Sort logic
  const sorted = Object.values(athletes).sort((a, b) => {
    // 1) Wins
    if (b.w !== a.w) return b.w - a.w;

    // 2) Point Differential
    if (b.pd !== a.pd) return b.pd - a.pd;

    // 3) Head-to-head
    const head = headToHead(a.name, b.name, matches);
    if (head !== 0) return head;

    // 4) Points For
    return b.pf - a.pf;
  });

  return sorted;
}

/* -----------------------------
   Head-to-head chooser
----------------------------- */
function headToHead(aName, bName, matches) {
  const fight = matches.find(m =>
    (m.redName === aName && m.greenName === bName) ||
    (m.greenName === aName && m.redName === bName)
  );

  if (!fight) return 0;

  if (fight.redName === aName && fight.redScore > fight.greenScore) return -1;
  if (fight.greenName === aName && fight.greenScore > fight.redScore) return -1;

  if (fight.redName === bName && fight.redScore > fight.greenScore) return 1;
  if (fight.greenName === bName && fight.greenScore > fight.redScore) return 1;

  return 0;
}

/* -----------------------------
   Render Standings
----------------------------- */
function renderRR(standings) {
  const box = document.getElementById("rrStandings");
  if (!box) return;

  let html = `
    <table class="rr-table">
      <tr>
        <th>Athlete</th>
        <th>W</th>
        <th>L</th>
        <th>PF</th>
        <th>PA</th>
        <th>PD</th>
      </tr>
  `;

  standings.forEach(a => {
    html += `
      <tr>
        <td class="rr-name">${a.name}</td>
        <td class="rr-win">${a.w}</td>
        <td class="rr-loss">${a.l}</td>
        <td>${a.pf}</td>
        <td>${a.pa}</td>
        <td class="${a.pd >= 0 ? 'rr-pd-pos' : 'rr-pd-neg'}">${a.pd}</td>
      </tr>
    `;
  });

  html += `</table>`;
  box.innerHTML = html;
}

/* -----------------------------
   Hook standings onto match feed
----------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("brackets")
  .doc(bracketId)
  .collection("matches")
  .orderBy("order")
  .onSnapshot((snap) => {
    const matches = [];
    snap.forEach(doc => matches.push(doc.data()));

    renderBracket(matches);   // your original bracket
    const standings = calculateRRStandings(matches);
    renderRR(standings);
  });
