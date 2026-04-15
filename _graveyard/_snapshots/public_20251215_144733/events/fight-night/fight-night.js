/* ============================================================
   FIGHT NIGHT MODE — Parent Arena Experience
   ============================================================ */

import { db } from "../../firebase-init.js";

const params = new URLSearchParams(location.search);
const eventId = params.get("event");
const matId   = params.get("mat");
const boutId  = params.get("bout");

const fnRed       = document.getElementById("fnRed");
const fnGreen     = document.getElementById("fnGreen");
const fnRedScore  = document.getElementById("fnRedScore");
const fnGreenScore= document.getElementById("fnGreenScore");
const fnFeed      = document.getElementById("fnFeed");

/* --------------------------
   MATCH INFO
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

    fnRed.textContent   = d.redName || "RED";
    fnGreen.textContent = d.greenName || "GREEN";

    animateScore(fnRedScore, d.redScore);
    animateScore(fnGreenScore, d.greenScore);
  });

/* Score Animation */
function animateScore(el, newVal) {
  const oldVal = parseInt(el.textContent);
  if (newVal > oldVal) {
    el.classList.add("score-pop");
    setTimeout(() => el.classList.remove("score-pop"), 500);
  }
  el.textContent = newVal;
}

/* --------------------------
   LOG FEED
--------------------------- */
db.collection("events")
  .doc(eventId)
  .collection("mats")
  .doc(`mat${matId}`)
  .collection("matches")
  .doc(boutId)
  .collection("log")
  .orderBy("ts","desc")
  .limit(12)
  .onSnapshot(snap => {
    fnFeed.innerHTML = "";
    snap.forEach(doc => {
      fnFeed.innerHTML += `
        <div>${new Date(doc.data().ts).toLocaleTimeString()} — ${doc.data().text}</div>
      `;
    });
  });

console.log("%cFIGHT NIGHT LIVE","color:#ffdd48;font-weight:bold;");
