/* ============================================================
   DIRECTOR DASHBOARD — Multi-Mat Overview
   Real-time unified view of all mats
   ============================================================ */

const matGrid = document.getElementById("mat-grid");

// TRACK MATS
const mats = {};   // mats[1], mats[2], mats[3], ...

// DEFAULT NUMBER OF MATS
const TOTAL_MATS = 8;

let directorData = {
  varsity: {},
  jv: {},
  youth: {}
};

// ============================================================
// 1) BUILD CARDS
// ============================================================

function buildMatCards() {
  for (let i = 1; i <= TOTAL_MATS; i++) {
    mats[i] = {
      scoreRed: 0,
      scoreGreen: 0,
      timer: "2:00",
      lastAction: "",
      bout: "",
      event: "",
      red: "RED",
      green: "GREEN"
    };

    const card = document.createElement("div");
    card.className = "mat-card";
    card.id = `mat-card-${i}`;

    card.innerHTML = `
      <div class="card-head">
        <div class="card-title">Mat ${i}</div>
        <button class="open" data-mat="${i}">Open</button>
      </div>

      <div class="names">
        <div class="n-red">${mats[i].red}</div>
        <div class="n-green">${mats[i].green}</div>
      </div>

      <div class="score-row">
        <div class="score-red"   id="m${i}-red">${mats[i].scoreRed}</div>
        <div class="score-green" id="m${i}-green">${mats[i].scoreGreen}</div>
      </div>

      <div class="timer" id="m${i}-clock">2:00</div>

      <div class="last" id="m${i}-last">—</div>

      <div class="info" id="m${i}-info">Bout — | Event —</div>
    `;

    matGrid.appendChild(card);
  }
}

buildMatCards();

function multiMatPush(matId, event) {
  const group = window.currentEventGroup || "varsity";

  if (!directorData[group][matId]) {
    directorData[group][matId] = {
      event: "—",
      bout: "--",
      red: 0,
      green: 0,
      clock: "2:00",
      log: []
    };
  }

  const mat = directorData[group][matId];

  if (event.type === "score") {
    mat.red = event.payload.red;
    mat.green = event.payload.green;
  }

  if (event.type === "clock") {
    mat.clock = event.payload.time;
  }

  if (event.type === "log") {
    mat.log.unshift(event.payload.text);
  }

  if (event.type === "match-info") {
    mat.event = event.payload.event;
    mat.bout = event.payload.bout;
  }

  renderBoard();
}
window.multiMatPush = multiMatPush;

// ============================================================
// 2) DIRECTOR RECEIVER for multi-mat feed
// ============================================================

/*
 Mat Console PRO calls:
   window.multiMatPush(matNumber, eventObj)
*/

window.multiMatPush = function(mat, event) {
  if (!mats[mat]) return;

  switch(event.type) {

    case "score":
      mats[mat].scoreRed = event.payload.red;
      mats[mat].scoreGreen = event.payload.green;
      document.getElementById(`m${mat}-red`).textContent = event.payload.red;
      document.getElementById(`m${mat}-green`).textContent = event.payload.green;
      break;

    case "clock":
      mats[mat].timer = event.payload.time;
      document.getElementById(`m${mat}-clock`).textContent = event.payload.time;
      break;

    case "log":
      mats[mat].lastAction = event.payload.text;
      document.getElementById(`m${mat}-last`).textContent = event.payload.text;
      break;

    case "match-info":
      mats[mat].bout  = event.payload.bout || "";
      mats[mat].event = event.payload.event || "";
      mats[mat].red   = event.payload.redName || "RED";
      mats[mat].green = event.payload.greenName || "GREEN";

      document.querySelector(`#mat-card-${mat} .n-red`).textContent   = mats[mat].red;
      document.querySelector(`#mat-card-${mat} .n-green`).textContent = mats[mat].green;

      document.getElementById(`m${mat}-info`).textContent =
        `Bout ${mats[mat].bout} | ${mats[mat].event}`;

      break;

    default:
      console.warn("Unknown event to director:", event);
  }
};
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    window.currentEventGroup = btn.dataset.event;
    renderBoard();
  };
});

document.getElementById("openArena").onclick = () => {
  window.open("/arena/fight-night.html", "_blank");
};

// ============================================================
// 3) OPEN A MAT CONSOLE (LOCAL)
// ============================================================

document.querySelectorAll(".open").forEach(btn => {
  btn.addEventListener("click", () => {
    const mat = btn.dataset.mat;
    window.open(`/mats/mat-console.html?mat=${mat}`, "_blank");
  });
});


console.log("%cDIRECTOR DASHBOARD READY","color:#00e1ff;font-weight:bold;");
