/* ============================================================
   Parent Live Dual Meet Scoreboard (2026)
   ============================================================ */

import { db } from "../../firebase-init.js";

const eventId = new URLSearchParams(location.search).get("event");
const matId   = new URLSearchParams(location.search).get("mat");

if (!eventId || !matId) {
  alert("Missing event + mat in URL");
}

/* -------------------------
   HTML targets
------------------------- */
const redTeamName   = document.getElementById("redTeamName");
const greenTeamName = document.getElementById("greenTeamName");
const redTeamScore  = document.getElementById("redTeamScore");
const greenTeamScore = document.getElementById("greenTeamScore");

const redName    = document.getElementById("redName");
const greenName  = document.getElementById("greenName");
const redBoutScore = document.getElementById("redBoutScore");
const greenBoutScore = document.getElementById("greenBoutScore");
const weightClass = document.getElementById("weightClass");

const momentumRed   = document.getElementById("momentumRed");
const momentumGreen = document.getElementById("momentumGreen");

const timeline = document.getElementById("timeline");

/* -------------------------
   1) LOAD EVENT HEADER
------------------------- */
db.collection("events")
  .doc(eventId)
  .onSnapshot(doc => {
    if (doc.exists) {
      document.getElementById("eventName").textContent = doc.data().name;
    }
  });

/* -------------------------
   2) DUAL MEET TEAM SCORES
------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("dual")
  .doc("teamScores")
  .onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();

    redTeamName.textContent = d.redTeamName;
    greenTeamName.textContent = d.greenTeamName;

    redTeamScore.textContent = d.redTeamScore;
    greenTeamScore.textContent = d.greenTeamScore;

    // MOMENTUM BAR
    const total = d.redTeamScore + d.greenTeamScore || 1;
    const redPct = (d.redTeamScore / total) * 100;
    momentumRed.style.width = redPct + "%";
    momentumGreen.style.width = (100 - redPct) + "%";
  });

/* -------------------------
   3) CURRENT BOUT INFO
------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("dual")
  .doc(`mat${matId}`)
  .onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();

    redName.textContent   = d.redName || "—";
    greenName.textContent = d.greenName || "—";

    redBoutScore.textContent   = d.redScore ?? "-";
    greenBoutScore.textContent = d.greenScore ?? "-";

    weightClass.textContent = d.weight || "—";
  });

/* -------------------------
   4) MATCH TIMELINE
------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("dual")
  .doc(`mat${matId}`)
  .collection("timeline")
  .orderBy("ts", "desc")
  .onSnapshot(snap => {
    timeline.innerHTML = "";
    snap.forEach(doc => {
      const ev = doc.data();
      timeline.innerHTML += `
        <div class="timeline-item">
          ${new Date(ev.ts).toLocaleTimeString()} — 
          ${ev.text}
        </div>
      `;
    });
  });

console.log("%cDUAL SCOREBOARD READY","color:#00e1ff;font-weight:bold;");
