import { SCORING_RULES } from "/lab/arena-console/shared/scoring-rules.js";

let redScore = 0;
let greenScore = 0;
let eventHistory = [];

const redScoreEl = document.getElementById("redScore");
const greenScoreEl = document.getElementById("greenScore");
const logEl = document.getElementById("actionLog");
const clockEl = document.getElementById("clock");

let time = 120;
let interval = null;

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getMatchBase() {
  return {
    athlete: document.getElementById("athleteName")?.value.trim() || "Sandman Athlete",
    opponent: document.getElementById("opponentName")?.value.trim() || "Opponent",
    matchId: JSON.parse(localStorage.getItem("arena_active_match") || "null")?.matchId || Date.now()
  };
}

function saveMatchState() {
  const state = {
    ...getMatchBase(),
    redScore,
    greenScore,
    timeRemaining: time,
    clock: formatTime(time),
    events: eventHistory,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem("arena_last_match_state", JSON.stringify(state));
  return state;
}

function updateClock() {
  clockEl.textContent = formatTime(time);
}

function updateScores() {
  redScoreEl.textContent = redScore;
  greenScoreEl.textContent = greenScore;
}

document.getElementById("startClock").onclick = () => {
  if (interval) return;

  interval = setInterval(() => {
    if (time > 0) {
      time--;
      updateClock();
      saveMatchState();
    }
  }, 1000);
};

document.getElementById("pauseClock").onclick = () => {
  clearInterval(interval);
  interval = null;
  saveMatchState();
};

document.getElementById("resetClock").onclick = () => {
  clearInterval(interval);
  interval = null;
  time = 120;
  updateClock();
  saveMatchState();
};

document.querySelectorAll("[data-code]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const side = btn.dataset.side;
    const code = btn.dataset.code;
    const rule = SCORING_RULES[code];

    if (!rule) return;

    if (rule.points > 0) {
      if (side === "red") redScore += rule.points;
      if (side === "green") greenScore += rule.points;
    }

    const event = {
      side,
      code,
      label: rule.label,
      points: rule.points,
      clock: formatTime(time),
      timeRemaining: time,
      createdAt: new Date().toISOString()
    };

    eventHistory.push(event);

    updateScores();
    renderLog();
    saveMatchState();
  });
});

function renderLog() {
  logEl.innerHTML = "";

  eventHistory.slice().reverse().forEach((e) => {
    const div = document.createElement("div");
    div.className = "log-item";
    div.textContent = `${e.clock} • ${e.side.toUpperCase()} • ${e.label} ${e.points ? "+" + e.points : ""}`;
    logEl.appendChild(div);
  });
}

document.getElementById("undoBtn").onclick = () => {
  const last = eventHistory.pop();
  if (!last) return;

  if (last.points > 0) {
    if (last.side === "red") redScore -= last.points;
    if (last.side === "green") greenScore -= last.points;
  }

  updateScores();
  renderLog();
  saveMatchState();
};

document.getElementById("recordBtn").onclick = () => {
  const current = saveMatchState();

  localStorage.setItem("arena_active_match", JSON.stringify({
    athlete: current.athlete,
    opponent: current.opponent,
    matchId: current.matchId
  }));

  window.location.href = "/lab/arena-console/record/record.html";
};

document.getElementById("endMatchBtn").onclick = () => {
  const finalState = saveMatchState();

  localStorage.setItem("arena_last_match_state", JSON.stringify(finalState));

  window.location.href = "/lab/arena-console/review/review.html";
};

updateClock();
updateScores();
saveMatchState();