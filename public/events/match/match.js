/* ============================================================
   Parent Live Match Viewer (2026)
   ============================================================ */

import { db } from "../../firebase-init.js";
import { startVideoStream } from "./video-player.js";

db.collection("events")
  .doc(eventId)
  .collection("streams")
  .doc(`mat${matId}`)
  .onSnapshot(doc => {
    if (!doc.exists) return;
    const { url } = doc.data();
    if (url) startVideoStream(url);
  });

const eventId = new URLSearchParams(location.search).get("event");
const matId   = new URLSearchParams(location.search).get("mat");
const boutId  = new URLSearchParams(location.search).get("bout");

if (!eventId || !matId || !boutId) {
  alert("Missing event/mat/bout query params");
}

/* ---------------------------
   HTML Targets
--------------------------- */
const redName     = document.getElementById("redName");
const greenName   = document.getElementById("greenName");
const redScore    = document.getElementById("redScore");
const greenScore  = document.getElementById("greenScore");
const clockBox    = document.getElementById("clock");
const periodNum   = document.getElementById("periodNum");

const momentumRed   = document.getElementById("momentumRed");
const momentumGreen = document.getElementById("momentumGreen");

const actionFeed = document.getElementById("actionFeed");

/* ---------------------------
   Load Event Name
--------------------------- */
db.collection("events")
  .doc(eventId)
  .onSnapshot(doc => {
    if (doc.exists) {
      document.getElementById("eventTitle").textContent = doc.data().name;
    }
  });

/* ---------------------------
   Live Match Info
   Path: events/{eId}/mats/{matId}/matches/{boutId}
--------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("mats")
  .doc(`mat${matId}`)
  .collection("matches")
  .doc(boutId)
  .onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();

    redName.textContent   = d.redName   || "—";
    greenName.textContent = d.greenName || "—";
    redScore.textContent  = d.redScore ?? 0;
    greenScore.textContent = d.greenScore ?? 0;

    clockBox.textContent  = d.clock || "2:00";
    periodNum.textContent = d.period || 1;

    // Momentum
    const total = d.redScore + d.greenScore || 1;
    const rPct = (d.redScore / total) * 100;

    momentumRed.style.width   = rPct + "%";
    momentumGreen.style.width = (100 - rPct) + "%";
  });

/* ---------------------------
   Action Feed
   Path: events/{eId}/mats/{mat}/matches/{bout}/log
--------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("mats")
  .doc(`mat${matId}`)
  .collection("matches")
  .doc(boutId)
  .collection("log")
  .orderBy("ts", "desc")
  .limit(20)
  .onSnapshot(snap => {
    actionFeed.innerHTML = "";
    snap.forEach(doc => {
      const ev = doc.data();
      actionFeed.innerHTML += `
        <div class="feed-item">
          ${new Date(ev.ts).toLocaleTimeString()} — ${ev.text}
        </div>
      `;
    });
  });

console.log("%cMATCH VIEWER READY","color:#00e1ff;font-weight:bold;");
