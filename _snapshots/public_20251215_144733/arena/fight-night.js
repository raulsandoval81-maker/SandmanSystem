console.log("%cFIGHT NIGHT ARENA — LIVE", "color:#ffdd48;font-size:16px");

/* Arena State */
const state = {
  event: "—",
  bout: "—",
  redName: "RED",
  greenName: "GREEN",
  redScore: 0,
  greenScore: 0,
  timer: "2:00",
  last: "—"
};

function updateArena() {
  document.getElementById("fn-event").textContent = state.event;
  document.getElementById("fn-bout").textContent = `Bout ${state.bout}`;

  document.getElementById("fn-red-name").textContent = state.redName;
  document.getElementById("fn-green-name").textContent = state.greenName;

  document.getElementById("fn-red-score").textContent = state.redScore;
  document.getElementById("fn-green-score").textContent = state.greenScore;

  document.getElementById("fn-timer").textContent = state.timer;

  const last = document.getElementById("fn-last-action");
  last.textContent = state.last;
  last.classList.add("flash");
  setTimeout(() => last.classList.remove("flash"), 300);
}

/* ============================================================
   RECEIVE FEED FROM DIRECTOR
   ============================================================ */

window.arenaFeedPush = function(packet) {
  switch(packet.type) {

    case "match-info":
      if (packet.payload.event) state.event = packet.payload.event;
      if (packet.payload.bout) state.bout = packet.payload.bout;
      if (packet.payload.redName) state.redName = packet.payload.redName;
      if (packet.payload.greenName) state.greenName = packet.payload.greenName;
      break;

    case "score":
      state.redScore = packet.payload.red;
      state.greenScore = packet.payload.green;
      break;

    case "clock":
      state.timer = packet.payload.time;
      break;

    case "log":
      state.last = packet.payload.text;
      break;
  }

  updateArena();
};
