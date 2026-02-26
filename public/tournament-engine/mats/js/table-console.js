/* ================================================================
   TABLE CONSOLE — 2026 CLEAN REBUILD
   ---------------------------------------------------------------
   Features:
   ✔ Multi-Mat selection
   ✔ Live scoreboard mirror
   ✔ Live main clock mirror
   ✔ Live boutsheet mirror
   ✔ Live action log
   ✔ Filmroom jump buttons auto-refresh
   ✔ Summary panel snapshot
================================================================ */

/* ---------------------------------------------------------------
   GLOBAL STATE: Director’s Live View
---------------------------------------------------------------- */
const MAT_MAX = 12;

const matState = {};
for (let i = 1; i <= MAT_MAX; i++) {
  matState[i] = {
    score: { red: 0, green: 0 },
    clock: "2:00",
    log: [],
    boutsheet: {},
    summary: {}
  };
}

let currentMat = 1;

/* ---------------------------------------------------------------
   DOM SHORTCUTS
---------------------------------------------------------------- */
function $(id) { return document.getElementById(id); }

/* Panels */
const scorePanel  = $("panel-score");
const logPanel    = $("panel-log");
const boutPanel   = $("panel-bout");
const filmPanel   = $("panel-film");
const sumPanel    = $("panel-summary");

/* Filmroom elements */
const videoEl     = $("matchVideo");
const jumpBox     = $("jumpButtons");

/* Scoreboard elements */
const redScoreEl   = $("redScore");
const greenScoreEl = $("greenScore");
const timerEl      = $("mainTimer");

/* Log box */
const logBox       = $("active-log");

/* Bout sheet preview */
const boutPreview  = $("boutPreview");

/* ---------------------------------------------------------------
   PANEL SWITCHING ENGINE
---------------------------------------------------------------- */
document.querySelectorAll(".tc-switch button").forEach(btn => {
  btn.addEventListener("click", () => {
    const panelId = btn.dataset.panel;

    document.querySelectorAll(".tc-panel").forEach(panel =>
      panel.classList.remove("active")
    );

    $(panelId).classList.add("active");
  });
});

/* ---------------------------------------------------------------
   MAT SELECTION
---------------------------------------------------------------- */
$("activeMat").addEventListener("change", e => {
  currentMat = parseInt(e.target.value, 10);
  renderFullMat(currentMat);
});

/* ---------------------------------------------------------------
   MASTER ENTRY POINT FOR MIRROR DATA
   Called from tableConsoleMirror.js:
   window.multiMatPush(matNumber, event)
---------------------------------------------------------------- */
window.multiMatPush = function (matNum, event) {
  if (!matState[matNum]) return;

  switch (event.type) {
    case "score":
      updateScore(matNum, event.payload);
      break;

    case "clock":
      updateClock(matNum, event.payload);
      break;

    case "log":
      appendLog(matNum, event.payload.text);
      break;

    case "boutsheet":
      updateBoutSheet(matNum, event.payload);
      break;

    case "special":
      updateSpecialMirror(matNum, event.payload);
      break;
  }

  if (matNum === currentMat) renderFullMat(matNum);
};

/* ================================================================
   SCORE MIRROR
================================================================ */
function updateScore(mat, data) {
  matState[mat].score.red   = data.red;
  matState[mat].score.green = data.green;
}

/* ================================================================
   CLOCK MIRROR
================================================================ */
function updateClock(mat, data) {
  matState[mat].clock = data.time;
}

/* ================================================================
   LOG MIRROR
================================================================ */
function appendLog(mat, text) {
  matState[mat].log.unshift({
    text,
    ts: Date.now()
  });

  if (matState[mat].log.length > 300) {
    matState[mat].log.length = 300; // prune history
  }
}

/* ================================================================
   BOUT SHEET MIRROR (Choice, Color)
================================================================ */
function updateBoutSheet(mat, payload) {
  matState[mat].boutsheet[payload.cell] = {
    choice: payload.choice,
    color: payload.color
  };
}

/* ================================================================
   SPECIAL TIME MIRROR (Blood, Injury, Ref, Concussion)
================================================================ */
function updateSpecialMirror(mat, payload) {
  // Example mirror: store special timers for summary
  matState[mat].summary[payload.id] = payload.value;
}

/* ================================================================
   RENDER FUNCTIONS
================================================================ */

/* -----------------------------
   Render entire mat dashboard
----------------------------- */
function renderFullMat(mat) {
  renderScore(mat);
  renderClock(mat);
  renderLog(mat);
  renderBoutsheet(mat);
  renderSummary(mat);

  if (window.refreshFilmroom) window.refreshFilmroom();
}

/* -----------------------------
   Scoreboard
----------------------------- */
function renderScore(mat) {
  const { red, green } = matState[mat].score;
  redScoreEl.textContent = red;
  greenScoreEl.textContent = green;
}

/* -----------------------------
   Clock
----------------------------- */
function renderClock(mat) {
  timerEl.textContent = matState[mat].clock;
}

/* -----------------------------
   Action Log
----------------------------- */
function renderLog(mat) {
  logBox.innerHTML = "";
  matState[mat].log.forEach(entry => {
    const div = document.createElement("div");
    div.className = "log-row";
    div.textContent = entry.text;
    logBox.appendChild(div);
  });
}

/* -----------------------------
   Bout Sheet Preview
----------------------------- */
function renderBoutsheet(mat) {
  const data = matState[mat].boutsheet;
  let html = "";

  Object.keys(data).forEach(cell => {
    const c = data[cell];
    html += `
      <div class="mini-choice ${c.color}">
        <b>${cell.toUpperCase()}</b> → ${c.choice}
      </div>
    `;
  });

  boutPreview.innerHTML = html || "<i>No choices yet</i>";
}

/* -----------------------------
   Summary Panel
----------------------------- */
function renderSummary(mat) {
  const sum = matState[mat].summary;
  let html = "<h3>Special Times</h3>";

  Object.keys(sum).forEach(id => {
    html += `
      <div class="sum-row">
        <span>${id}</span>
        <b>${sum[id]}</b>
      </div>
    `;
  });

  $("summaryBox").innerHTML = html || "<i>No special data yet</i>";
}

/* ================================================================
   FILMROOM REFRESH
================================================================ */
window.refreshFilmroom = function () {
  const mat = currentMat;
  import("./filmroomButtons.js").then(mod => {
    mod.buildFilmButtons(matState[mat].log);
  });
};

/* ================================================================
   READY
================================================================ */
console.log("%cTABLE CONSOLE READY","color:#00ffaa;font-weight:bold;");
