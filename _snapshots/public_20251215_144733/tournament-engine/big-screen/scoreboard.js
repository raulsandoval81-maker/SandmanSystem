/* =========================================================
   SANDMAN TOURNAMENT ENGINE — SCOREBOARD v1.0
   (FREE + PRO AUTO-DETECT • BROADCAST SYNC)
   ========================================================= */

// ---------------------------
// SAFE ELEMENT GETTER
// ---------------------------
const $ = (id) => document.getElementById(id);

// ---------------------------
// CORE ELEMENTS (ALWAYS PRESENT)
// ---------------------------
const redScoreEl   = $("red-score");
const greenScoreEl = $("green-score");
const timerEl      = $("timer");
const periodEl     = $("period");
const winnerBar    = $("winner-bar");

const refTimeEl    = $("ref-time");
const bloodTimeEl  = $("blood-time");
const injTimeEl    = $("injury-time");

// ---------------------------
// PRO ELEMENTS (MAY NOT EXIST)
// ---------------------------
const redNameEl    = $("red-name");
const greenNameEl  = $("green-name");

const redFallEl    = $("red-fall-time");
const greenFallEl  = $("green-fall-time");

const flashEl      = $("flash");

// Detect mode
const IS_PRO = !!redNameEl;  
console.log("Scoreboard Mode:", IS_PRO ? "PRO" : "FREE");

// ---------------------------
// BROADCAST CHANNEL (SYNC)
// ---------------------------
const channel = new BroadcastChannel("mat-score-sync");

// ---------------------------
// SCORE POP (Pro only)
// ---------------------------
function scorePop(el) {
  if (!IS_PRO) return;
  el.classList.add("pop");
  setTimeout(() => el.classList.remove("pop"), 160);
}

// ---------------------------
// STATE OBJECT
// ---------------------------
let state = {
  red: 0,
  green: 0,
  timer: "2:00",
  period: "1st",
  ref: "0:00",
  blood: "0:00",
  inj: "0:00",
  winner: "",     
  method: "",     
  fallTimeRed: "",
  fallTimeGreen: "",
  redName: "",
  greenName: ""
};

// ---------------------------
// APPLY STATE TO SCREEN
// ---------------------------
function applyState() {

  // Core scores
  redScoreEl.textContent   = state.red;
  greenScoreEl.textContent = state.green;

  timerEl.textContent  = state.timer;
  periodEl.textContent = state.period;

  refTimeEl.textContent   = state.ref;
  bloodTimeEl.textContent = state.blood;
  injTimeEl.textContent   = state.inj;

  // Winner bar
  if (state.winner) {
    winnerBar.style.display = "block";
    winnerBar.textContent   = state.winner;

    winnerBar.classList.toggle("win-red",   state.method && state.method.includes("red"));
    winnerBar.classList.toggle("win-green", state.method && state.method.includes("green"));
  } else {
    winnerBar.style.display = "none";
  }

  // PRO ONLY DISPLAY
  if (IS_PRO) {
    if (redNameEl)  redNameEl.textContent  = state.redName;
    if (greenNameEl) greenNameEl.textContent = state.greenName;

    if (redFallEl)   redFallEl.textContent   = state.fallTimeRed;
    if (greenFallEl) greenFallEl.textContent = state.fallTimeGreen;
  }
}

// ---------------------------
// LISTEN FOR CONTROL MESSAGES
// ---------------------------
channel.onmessage = (msg) => {
  const data = msg.data;
  handleIncoming(data);
};

// ---------------------------
// HANDLE COMMANDS FROM PRO
// ---------------------------
function handleIncoming(data) {

  // Score update
  if (data.cmd === "score") {
    state[data.side] = data.value;

    // Score pop on PRO
    if (data.side === "red") scorePop(redScoreEl);
    else scorePop(greenScoreEl);

    applyState();
  }

  // Timer update
  if (data.cmd === "timer") {
    state.timer = data.value;
    applyState();
  }

  // Subtimes
  if (data.cmd === "subtime") {
    state[data.type] = data.value;
    applyState();
  }

  // Period
  if (data.cmd === "period") {
    state.period = data.value;
    applyState();
  }

  // Names (Pro only)
  if (data.cmd === "names" && IS_PRO) {
    state.redName   = data.red;
    state.greenName = data.green;
    applyState();
  }

  // Fall time
  if (data.cmd === "falltime" && IS_PRO) {
    if (data.side === "red")   state.fallTimeRed   = data.value;
    if (data.side === "green") state.fallTimeGreen = data.value;
    applyState();
  }

  // Winner
  if (data.cmd === "winner") {
    animateWinner(data.type, data.color, data.extra);
  }
}

// ---------------------------
// WINNER EFFECTS (Full Package)
// ---------------------------
function animateWinner(type, color, extra = "") {

  // Build message
  let text = "";
  switch (type) {
    case "decision": text = "WIN BY DECISION"; break;
    case "major":    text = "WIN BY MAJOR"; break;
    case "tech":     text = "WIN BY TECH FALL"; break;
    case "pin":      text = "WIN BY FALL"; break;
    case "falltime": text = `FALL TIME ${extra}`; break;
  }

  // Update state
  state.winner = text;
  state.method = color;
  applyState();

  // PRO-LEVEL EFFECTS
  if (IS_PRO) {
    if (type === "major") {
      winnerBar.classList.add("win-major");
    }

    if (type === "tech") {
      winnerBar.classList.add("win-tech");
    }

    if (type === "pin") {
      if (flashEl) {
        flashEl.style.display = "block";
        flashEl.classList.add("flash");
        setTimeout(() => {
          flashEl.style.display = "none";
          flashEl.classList.remove("flash");
        }, 650);
      }
    }
  }
}

// ---------------------------
// INITIAL RENDER
// ---------------------------
applyState();
