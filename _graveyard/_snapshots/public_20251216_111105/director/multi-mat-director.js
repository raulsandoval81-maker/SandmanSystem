console.log("%cDIRECTOR BOARD — LIVE (2026)", "color:#ffdd48;font-weight:bold;");

/* ============================================================
   1) DIRECTOR STATE
============================================================ */

const directorBoard = document.getElementById("directorBoard");

const mats = {};   // mats[1], mats[2], ...
const MAX_LOG = 10;

let currentEventGroup = "varsity";

const groups = {
  varsity: {},
  jv: {},
  youth: {}
};
function directorBroadcastToArena(mat, packet) {
  if (window.arenaFeedPush) {
    window.arenaFeedPush(packet);
  }
}

// inside window.multiMatPush(mat, packet):
directorBroadcastToArena(mat, packet);

/* ============================================================
   2) RENDER BOARD
============================================================ */

function renderDirector() {
  const src = groups[currentEventGroup];

  directorBoard.innerHTML = "";

  Object.keys(src).sort((a,b)=>a-b).forEach(matNum => {
    const m = src[matNum];

    const card = document.createElement("div");
    card.className = "mat-card";

    card.innerHTML = `
      <div class="mat-header">MAT ${matNum}</div>
      <div class="mat-event">${m.event}</div>
      <div class="mat-bout">Bout: ${m.bout}</div>

      <div class="mat-score">
        <div class="mat-score-red">${m.red}</div>
        <div class="mat-score-green">${m.green}</div>
      </div>

      <div class="mat-clock">${m.clock}</div>

      <button class="qr-btn" data-mat="${matNum}">QR</button>

      <div class="mat-log">
        ${m.log.map(l => `<div class="mat-log-row">${l}</div>`).join("")}
      </div>
    `;

    directorBoard.appendChild(card);
  });

  hookQrButtons();
}

/* ============================================================
   3) ENTRY — Mat Console pushes into here
============================================================ */

window.multiMatPush = function(matId, packet) {
  const group = currentEventGroup;
  if (!groups[group][matId]) {
    groups[group][matId] = {
      event: "—",
      bout: "--",
      red: 0,
      green: 0,
      clock: "2:00",
      log: []
    };
  }

  const m = groups[group][matId];

  switch (packet.type) {

    case "score":
      m.red = packet.payload.red;
      m.green = packet.payload.green;
      break;

    case "clock":
      m.clock = packet.payload.time;
      break;

    case "log":
      m.log.unshift(packet.payload.text);
      if (m.log.length > MAX_LOG) m.log.pop();
      break;

    case "match-info":
      if (packet.payload.bout) m.bout = packet.payload.bout;
      if (packet.payload.event) m.event = packet.payload.event;
      break;
  }

  renderDirector();
};

/* ============================================================
   4) EVENT TAB HANDLER
============================================================ */

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentEventGroup = btn.dataset.event;
    renderDirector();
  });
});

/* ============================================================
   5) DIRECTOR → MAT COMMANDS
============================================================ */

document.querySelectorAll(".cmd").forEach(btn => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;

    // broadcast command to all mat consoles
    fetch(`/director/cmd?type=${cmd}`)
      .then(r => console.log("CMD sent:", cmd));
  });
});

/* ============================================================
   6) QR Code overlay
============================================================ */

function hookQrButtons() {
  document.querySelectorAll(".qr-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mat = btn.dataset.mat;
      const url = `${location.origin}/parents/parentTeamView.html?mat=${mat}`;
      generateQr(url);
    });
  });
}

function generateQr(url) {
  const box = document.getElementById("qrBox");
  box.innerHTML = "";
  new QRCode(box, url);
  document.getElementById("qrOverlay").classList.remove("hidden");
}

document.getElementById("closeQr").onclick = () =>
  document.getElementById("qrOverlay").classList.add("hidden");
/* ============================================================
   DIRECTOR → MAT COMMANDS (2026)
   ============================================================ */

document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("cmd")) return;

  const mat = e.target.dataset.mat;
  const cmd = e.target.dataset.cmd;

  console.log(`DIRECTOR CMD → MAT ${mat}: ${cmd}`);

  // Broadcast to mat console
  window.postMessage({
    target: "mat-console",
    mat: Number(mat),
    cmd: cmd
  }, "*");
});

/* ============================================================
   READY
============================================================ */

console.log("%cDIRECTOR DASHBOARD READY","color:#00e1ff;font-weight:bold;");
