/* ============================================================
   TABLE CONSOLE MIRROR — 2026
   Receives real-time packets from Mat Console PRO
   ============================================================ */

console.log("%cTABLE MIRROR LIVE (2026)", "color:#ffdd48;font-weight:bold;");

/* ------------------------------------------------------------
   ENTRY POINT — Called by Mat Console:
   window.tableMirrorPush(eventObj)
------------------------------------------------------------ */

window.tableMirrorPush = function (event) {
  if (!event || !event.type) return;

  switch (event.type) {

    case "score":
      mirrorScore(event.payload);
      break;

    case "clock":
      mirrorClock(event.payload);
      break;

    case "special":
      mirrorSpecial(event.payload);
      break;

    case "log":
      mirrorLog(event.payload);
      break;

    case "boutsheet":
      mirrorBoutSheet(event.payload);
      break;

    case "match-info":
      mirrorMatchInfo(event.payload);
      break;

    default:
      console.warn("[Mirror] Unknown event:", event);
  }
};

/* ============================================================
   SCORE MIRROR
============================================================ */
function mirrorScore(data) {
  if (!data) return;
  if (data.red   !== undefined) document.getElementById("redScore").textContent = data.red;
  if (data.green !== undefined) document.getElementById("greenScore").textContent = data.green;
}

/* ============================================================
   CLOCK MIRROR
============================================================ */
function mirrorClock(data) {
  if (!data) return;
  document.getElementById("mainTimer").textContent = data.time;
}

/* ============================================================
   SPECIAL TIMES MIRROR
============================================================ */
function mirrorSpecial(data) {
  if (!data || !data.id) return;
  const el = document.getElementById(data.id);
  if (el) el.textContent = data.value;
}

/* ============================================================
   ACTION LOG MIRROR
============================================================ */
function mirrorLog(data) {
  if (!data || !data.text) return;

  const box = document.getElementById("active-log");
  if (!box) return;

  const div = document.createElement("div");
  div.classList.add("log-row");
  div.textContent = data.text;

  box.prepend(div);
}

/* ============================================================
   BOUT SHEET MIRROR
============================================================ */
function mirrorBoutSheet(data) {
  const { cell, color } = data;
  const el = document.getElementById(cell);
  if (!el) return;

  el.classList.remove("red-choice", "green-choice");

  if (color === "red") el.classList.add("red-choice");
  if (color === "green") el.classList.add("green-choice");
}

/* ============================================================
   MATCH INFO MIRROR
============================================================ */
function mirrorMatchInfo({ event, mat, bout, redName, greenName }) {
  if (event) document.getElementById("eventName").textContent = event;
  if (mat)   document.getElementById("matNumber").textContent = mat;
  if (bout)  document.getElementById("boutNumber").textContent = bout;

  if (redName)
    document.querySelector(".ath-label.red")?.textContent = redName;

  if (greenName)
    document.querySelector(".ath-label.green")?.textContent = greenName;
}

