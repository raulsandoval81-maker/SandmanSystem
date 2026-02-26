/* ============================================================
   PARENT LIVE FEED — 2026
   Receives broadcast events from event-sync.js
   and updates the fan-facing display.
   ============================================================ */

console.log("%cPARENT LIVE FEED READY", "color:#00ffbb;font-weight:bold;");

const redBox   = document.getElementById("parentRedScore");
const greenBox = document.getElementById("parentGreenScore");
const timerBox = document.getElementById("parentClock");
const nameRed  = document.getElementById("parentRedName");
const nameGreen= document.getElementById("parentGreenName");
const boutBox  = document.getElementById("parentBout");
const eventBox = document.getElementById("parentEvent");


/* ============================================================
   RECEIVER FROM EVENT-SYNC
   ------------------------------------------------------------
   event-sync.js calls:
     window.parentLivePush(packet)
   ============================================================ */

window.parentLivePush = function(packet) {

  switch (packet.type) {

    case "score":
      redBox.textContent   = packet.payload.red;
      greenBox.textContent = packet.payload.green;
      break;

    case "clock":
      timerBox.textContent = packet.payload.time;
      break;

    case "match-info":
      if (packet.payload.redName)   nameRed.textContent   = packet.payload.redName;
      if (packet.payload.greenName) nameGreen.textContent = packet.payload.greenName;
      if (packet.payload.event)     eventBox.textContent = packet.payload.event;
      if (packet.payload.bout)      boutBox.textContent  = `Bout ${packet.payload.bout}`;
      break;

    default:
      console.warn("ParentFeed: Unknown event", packet);
  }
};
