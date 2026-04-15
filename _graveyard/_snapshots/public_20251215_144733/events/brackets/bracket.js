/* ===========================================================
   PUBLIC BRACKET VIEWER (2026)
   Loads: R16 → QF → SF → F → Consos → Placement
   =========================================================== */

import { db } from "../../firebase-init.js";

const eventId = new URLSearchParams(location.search).get("event");
const bracketId = new URLSearchParams(location.search).get("bracket");

const grid = document.getElementById("bracketGrid");
const eventName = document.getElementById("eventName");

if (!eventId || !bracketId) {
  eventName.textContent = "Missing event or bracket ID";
}

/* ------------------------------
   Load event name
------------------------------- */
db.collection("events").doc(eventId).onSnapshot(doc => {
  if (doc.exists) eventName.textContent = doc.data().name;
});

/* ------------------------------
   Load bracket rounds
   Stored as: /events/{eventId}/brackets/{bracketId}/rounds/*
------------------------------- */
const rounds = [
  { id: "r16",   name: "Round of 16" },
  { id: "qf",    name: "Quarterfinals" },
  { id: "sf",    name: "Semifinals" },
  { id: "finals",name: "Finals" },
  { id: "c1",    name: "Consolation 1" },
  { id: "c2",    name: "Consolation 2" },
  { id: "c3",    name: "Consolation 3" },
  { id: "c4",    name: "Consolation 4" },
  { id: "place", name: "Placement" }
];

rounds.forEach(r => {
  const section = document.createElement("div");
  section.className = "bracket-section";
  section.id = r.id;

  section.innerHTML = `<div class="section-title">${r.name}</div>`;

  grid.appendChild(section);

  // Live updates
  db.collection("events")
    .doc(eventId)
    .collection("brackets")
    .doc(bracketId)
    .collection(r.id)
    .orderBy("matchNumber")
    .onSnapshot(snap => {
      section.innerHTML = `<div class="section-title">${r.name}</div>`;
      snap.forEach(doc => {
        const m = doc.data();
        section.innerHTML += `
          <div class="match-card">
            <div class="ath-row"><span>${m.red}</span> <strong>${m.redScore ?? "-"}</strong></div>
            <div class="ath-row"><span>${m.green}</span> <strong>${m.greenScore ?? "-"}</strong></div>
            <div class="ath-row small">Match: ${m.matchNumber}</div>
          </div>
        `;
      });
    });
});

console.log("%cBRACKET VIEW READY","color:#00e1ff");
