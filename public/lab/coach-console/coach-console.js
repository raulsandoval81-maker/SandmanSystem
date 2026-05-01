import { MATCH_FORMATS } from "./shared/match-formats.js";
import { SCORING_RULES, RESULT_TYPES } from "./shared/scoring-rules.js";

import {
  createMatchState,
  setMatchFormat,
  advanceRound,
  applyRoundChoice,
  applyScore,
  undoScore,
  getRoundSeconds,
  getVisibleRounds,
  setMatchResult,
  setSecondPeriodFirstChooser
} from "./shared/match-state.js";

import {
  createScoreEvent,
  createRefCallEvent,
  createRoundStartEvent,
  groupEventsByRound,
  formatTime,
  formatRoundLabel,
  formatSide,
  sideClass
} from "./shared/event-log.js";

import { handleRefProgression } from "./shared/progression-engine.js";
const state = createMatchState();
state.position = "neutral";
const consoleMode = document.body.dataset.console || "classic";

let events = [];
let mode = "live";
let matchConfirmed = false;

let mediaRecorder;
let stream = null;
let chunks = [];


/* DOM */
const statusEl = document.getElementById("status");
const preview = document.getElementById("preview");
const reviewPreview = document.getElementById("reviewPreview");

const liveBtn = document.getElementById("liveMode");
const reviewBtn = document.getElementById("reviewMode");

const matchSetupEl = document.getElementById("matchSetup");
const confirmMatchSetupBtn = document.getElementById("confirmMatchSetup");

const eventNameInput = document.getElementById("eventNameInput");
const weightClassInput = document.getElementById("weightClassInput");
const eventNameDisplay = document.getElementById("eventNameDisplay");
const weightClassDisplay = document.getElementById("weightClassDisplay");

const redTeamInput = document.getElementById("redTeamInput");
const greenTeamInput = document.getElementById("greenTeamInput");
const athleteNameInput = document.getElementById("athleteName");
const opponentNameInput = document.getElementById("opponentName");

const redTeamEl = document.getElementById("redTeam");
const greenTeamEl = document.getElementById("greenTeam");
const redDisplayName = document.getElementById("redDisplayName");
const greenDisplayName = document.getElementById("greenDisplayName");

const athleteScoreEl = document.getElementById("athleteScore");
const opponentScoreEl = document.getElementById("opponentScore");
const clockEl = document.getElementById("clock");
const currentRoundEl = document.getElementById("currentRound");

const eventLogEl = document.getElementById("eventLog");

const boutBoardEl = document.getElementById("boutBoard");
const boutRailEl = document.getElementById("boutRail");
const reviewBoutBoardEl = document.getElementById("reviewBoutBoard");
const reviewBoutRailEl = document.getElementById("reviewBoutRail");

const matchFormatSelect = document.getElementById("matchFormat");
const choicePanel = document.getElementById("choicePanel");

const startBtn = document.getElementById("startRecord");
const pauseBtn = document.getElementById("pauseClock");
const stopBtn = document.getElementById("stopRecord");
const resetBtn = document.getElementById("resetClock");

const chooserPanel = document.getElementById("chooserPanel");
const greenChooserBtn = document.getElementById("greenChooserBtn");
const redChooserBtn = document.getElementById("redChooserBtn");

const toggleAdjustClockBtn = document.getElementById("toggleAdjustClock");
const adjustClockPanel = document.getElementById("adjustClockPanel");

const toggleAdjustScoreBtn = document.getElementById("toggleAdjustScore");
const adjustScorePanel = document.getElementById("adjustScorePanel");

const resetMatchBtn = document.getElementById("resetMatch");
const matchActionsBtn = document.getElementById("toggleMatchActions");
const matchActionsPanel = document.getElementById("matchActionsPanel");
const manualNextRoundBtn = document.getElementById("nextRound");

const matchSummaryModal = document.getElementById("matchSummaryModal");
const closeMatchSummaryBtn = document.getElementById("closeMatchSummary");
const finishBtn = document.getElementById("endMatch");

const reviewWinnerEl = document.getElementById("reviewWinner");
const reviewResultEl = document.getElementById("reviewResult");
const summaryScoreEl = document.getElementById("summaryScore");
const summarySuggestedResultEl = document.getElementById("summarySuggestedResult");

/* HELPERS */
function setStatus(text) {
  if (!statusEl) return;

  statusEl.textContent = text;

  statusEl.classList.remove("status-flash");
  void statusEl.offsetWidth; // restart animation
  statusEl.classList.add("status-flash");
}
function showFinishFlash(text, winner) {
  const el = document.getElementById("finishFlash");
  if (!el) return;

  el.textContent = text;
  el.className = "finish-flash show " + (winner === "athlete" ? "green" : "red");

  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.className = "finish-flash";
  }, 1100);
}

function getVideoTarget() {
  return mode === "review" && reviewPreview ? reviewPreview : preview;
}

function updateClock() {
  if (clockEl) clockEl.textContent = formatTime(state.time);
}

function updateScores() {
  if (athleteScoreEl) athleteScoreEl.textContent = state.athleteScore;
  if (opponentScoreEl) opponentScoreEl.textContent = state.opponentScore;
}
function updatePositionIndicator(){
  const el = document.getElementById("positionIndicator");
  if (!el) return;

  if (state.position === "neutral") {
    el.textContent = "NEUTRAL";
    el.className = "position-indicator";
  } else if (state.position === "green_top") {
    el.textContent = "GREEN TOP";
    el.className = "position-indicator green-top";
  } else {
    el.textContent = "RED TOP";
    el.className = "position-indicator red-top";
  }
}
function getInvalidMessage(position, side){
  if (position === "neutral") return "Neutral — only takedowns allowed";
  if (position === "green_top") {
    return side === "athlete"
      ? "Green top — use Nearfall/Pin"
      : "Red bottom — Escape or Reversal";
  }
  if (position === "red_top") {
    return side === "opponent"
      ? "Red top — use Nearfall/Pin"
      : "Green bottom — Escape or Reversal";
  }
  return "Invalid";
}

function updateRoundDisplay() {
  if (currentRoundEl) currentRoundEl.textContent = formatRoundLabel(state.currentRound);
}

function updateIdentityStrip() {
  if (greenDisplayName) {
    greenDisplayName.textContent = athleteNameInput?.value.trim() || "Athlete B";
  }

  if (redDisplayName) {
    redDisplayName.textContent = opponentNameInput?.value.trim() || "Athlete A";
  }

  if (greenTeamEl) {
    greenTeamEl.textContent = greenTeamInput?.value.trim() || "Team";
  }

  if (redTeamEl) {
    redTeamEl.textContent = redTeamInput?.value.trim() || "Team";
  }

  if (eventNameDisplay) {
    eventNameDisplay.textContent = `Event: ${eventNameInput?.value.trim() || "—"}`;
  }

  if (weightClassDisplay) {
    weightClassDisplay.textContent = `Weight: ${weightClassInput?.value.trim() || "—"}`;
  }
}

function lockMatchSetup(locked) {
  [
    eventNameInput,
    weightClassInput,
    redTeamInput,
    greenTeamInput,
    athleteNameInput,
    opponentNameInput,
    matchFormatSelect
  ].forEach(el => {
    if (el) el.disabled = locked;
  });
}

function getWinnerLabel(winner) {
  if (winner === "athlete") return `GREEN — ${greenDisplayName?.textContent || "Athlete B"}`;
  if (winner === "opponent") return `RED — ${redDisplayName?.textContent || "Athlete A"}`;
  return "—";
}

function getResultLabel(type) {
  const map = {
    decision: "Decision",
    major: "Major",
    tech: "Tech Fall",
    pin: "Pin",
    dq: "DQ",
    forfeit: "Forfeit"
  };

  return map[type] || type || "—";
}

function updateMatchSummary() {
  if (summaryScoreEl) {
    summaryScoreEl.textContent = `RED ${state.opponentScore} — GREEN ${state.athleteScore}`;
  }

  if (summarySuggestedResultEl) {
    summarySuggestedResultEl.textContent =
      `Suggested: ${getWinnerLabel(state.winner)} by ${getResultLabel(state.resultType)}`;
  }
}
function syncSummaryButtons() {
  document.querySelectorAll("[data-winner]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.winner === state.winner);
  });

  document.querySelectorAll("[data-finish-type]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.finishType === state.resultType);
  });
}

function getResultTypeFromMargin(diff) {
  return RESULT_TYPES.find(r => {
    if (!r.minDiff) return false;
    if (r.maxDiff) return diff >= r.minDiff && diff <= r.maxDiff;
    return diff >= r.minDiff;
  })?.key || "decision";
}

function checkTechFall() {
   if (state.resultLocked) return;
  const margin = Math.abs(state.athleteScore - state.opponentScore);

  if (margin < 15 || state.resultLocked) return;

  const winner = state.athleteScore > state.opponentScore
    ? "athlete"
    : "opponent";

  setMatchResult(state, winner, "tech", true);
  showFinishFlash("TECH FALL", winner);

  stopClock("Tech Fall — match stopped");
  pauseVideoCapture();

  updateStartButton("Start", false);
  matchSummaryModal?.classList.remove("hidden");
}

function syncAutoResult() {
  if (state.resultLocked) return;

  const red = state.opponentScore;
  const green = state.athleteScore;

  if (red === green) return;

  const winner = green > red ? "athlete" : "opponent";
  const margin = Math.abs(green - red);
  const resultType = getResultTypeFromMargin(margin);

  setMatchResult(state, winner, resultType, false);
}

function updateReviewResult() {
  if (reviewWinnerEl) {
    reviewWinnerEl.textContent = `Winner: ${getWinnerLabel(state.winner)}`;
  }

  if (reviewResultEl) {
    reviewResultEl.textContent = `Result: ${getResultLabel(state.resultType)}`;
  }
}

function updateStartButton(text = "Start", disabled = false) {
  if (!startBtn) return;
  startBtn.textContent = text;
  startBtn.disabled = disabled;
}

function stopClock(statusText = "Clock paused") {
  clearInterval(state.timer);
  state.timer = null;
  setStatus(statusText);
  saveLocalDraft();
}

function resetClock() {
  clearInterval(state.timer);
  state.timer = null;

  state.time = getRoundSeconds(state, state.currentRound);

  updateClock();
  setStatus("Clock reset");
  saveLocalDraft();
}

function adjustClock(seconds) {
  state.time = Math.max(0, state.time + seconds);
  updateClock();
  saveLocalDraft();
}

function stopCameraStream() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

function pauseVideoCapture() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.requestData?.();
    mediaRecorder.pause();
  }
}

function resumeVideoCapture() {
  if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
  }
}

/* POSITION GUARD */
function isValidAction(position, side, code) {
if (["penalty", "stall", "caution"].includes(code)) return true;

  if (position === "neutral") {
    return code === "td3";
  }

  if (position === "green_top") {
    if (side === "athlete") return ["nf2", "nf3", "nf4"].includes(code);
    if (side === "opponent") return ["esc1", "rev2"].includes(code);
  }

  if (position === "red_top") {
    if (side === "opponent") return ["nf2", "nf3", "nf4"].includes(code);
    if (side === "athlete") return ["esc1", "rev2"].includes(code);
  }

  return true;
}
function updateCompactVisibility() {
  document.querySelectorAll("[data-code]").forEach(btn => {
    const side = btn.dataset.side;
    const code = btn.dataset.code;
    const valid = isValidAction(state.position, side, code);

    btn.style.display = valid ? "" : "none";
  });
}

function updatePositionAfterScore(state, side, code) {
  if (code === "td3") {
    state.position = side === "athlete" ? "green_top" : "red_top";
  }

  if (code === "esc1") {
    state.position = "neutral";
  }

  if (code === "rev2") {
    state.position = side === "athlete" ? "green_top" : "red_top";
  }
}

function setPositionFromRoundStart(position) {
  if (position === "neutral") {
    state.position = "neutral";
    return;
  }

  if (position === "green_top" || position === "red_bottom") {
    state.position = "green_top";
    return;
  }

  if (position === "red_top" || position === "green_bottom") {
    state.position = "red_top";
    return;
  }

  state.position = "neutral";
}

/* ROUND FLOW */
function handleRoundComplete() {
  stopClock("Round complete");
  pauseVideoCapture();

  const result = advanceRound(state);

  if (result.round === "2" && !state.secondPeriodFirstChooser) {
    setStatus("Who has choice?");
    chooserPanel?.classList.remove("hidden");
    choicePanel?.classList.add("hidden");
    return;
  }

  if (!result.advanced) {
    setStatus("Match complete — open Match Summary");
    matchSummaryModal?.classList.remove("hidden");
    syncAutoResult();
    renderAll();
    saveLocalDraft();
    return;
  }

  if (result.requiresChoice) {
    updateStartButton("Start", true);
    setStatus("Choice required");
    renderAll();
    saveLocalDraft();
    return;
  }

  const startPosition = state.roundStarts[state.currentRound] || "neutral";
  setPositionFromRoundStart(startPosition);

  events.push(createRoundStartEvent({
    state,
    round: state.currentRound,
    position: startPosition,
    videoTime: preview?.currentTime || 0
  }));

  pauseVideoCapture();
  updateStartButton("Start", false);
  setStatus(`${formatRoundLabel(state.currentRound)} ready — press Start`);

  renderAll();
  saveLocalDraft();
}

function startClock() {
  if (state.timer) return;

  state.timer = setInterval(() => {
    state.time -= 1;
    if (state.time < 0) state.time = 0;

    updateClock();
    saveLocalDraft();

    if (state.time === 0) {
      handleRoundComplete();
    }
  }, 1000);

  setStatus(`${formatRoundLabel(state.currentRound)} running`);
}

/* RENDER EVENTS */
function renderEventList(target, limit = null) {
  if (!target) return;

  target.innerHTML = "";

  const list = events.slice().reverse();
  const visible = limit ? list.slice(0, limit) : list;

  visible.forEach(e => {
    const div = document.createElement("div");
    div.className = `event ${e.side ? sideClass(e.side) : ""}`;

    if (e.type === "round_start") {
      div.textContent = `${formatRoundLabel(e.round)} · START · ${e.position}`;
    } else {
      div.textContent =
        `${e.clock} · ${formatRoundLabel(e.round)} · ${formatSide(e.side)} · ${e.label}${e.points ? " +" + e.points : ""}`;
    }

    div.addEventListener("click", () => {
      const video = getVideoTarget();
      if (!video || typeof e.videoTime !== "number") return;

      video.currentTime = e.videoTime;
      video.play();
    });

    target.appendChild(div);
  });
}

function renderEvents() {
  renderEventList(eventLogEl);
}

function renderBoutBoardTarget(target) {
  if (!target) return;

  const grouped = groupEventsByRound(events);
  const visibleRounds = getVisibleRounds(state, events);

  target.innerHTML = "";

  visibleRounds.forEach(round => {
    const roundEvents = grouped[round] || [];

    const block = document.createElement("div");
    block.className = "round-block";

    const title = document.createElement("div");
    title.className = "round-title";
    title.textContent = formatRoundLabel(round);

    const eventsWrap = document.createElement("div");
    eventsWrap.className = "round-events";

    if (!roundEvents.length) {
      const empty = document.createElement("span");
      empty.className = "round-empty";
      empty.textContent = "—";
      eventsWrap.appendChild(empty);
    } else {
      roundEvents.forEach(e => {
        const chip = document.createElement("span");

        if (e.type === "round_start") {
          chip.className = "flow-stamp setup";
          chip.textContent = `START ${e.position}`;
        } else {
          chip.className = "flow-stamp " + (e.side === "athlete" ? "green" : "red");

          const label = e.short || e.code.toUpperCase();

          chip.textContent = e.points ? `${label} +${e.points}` : label;
          chip.title = `${e.clock} • ${formatSide(e.side)} • ${e.label}`;
        }

        chip.addEventListener("click", () => {
          const video = getVideoTarget();
          if (!video || typeof e.videoTime !== "number") return;

          video.currentTime = e.videoTime;
          video.play();
        });

        eventsWrap.appendChild(chip);
      });
    }

    block.appendChild(title);
    block.appendChild(eventsWrap);
    target.appendChild(block);
  });
}

function renderBoutBoard() {
  renderBoutBoardTarget(boutBoardEl);
  renderBoutBoardTarget(reviewBoutBoardEl);
}

function renderBoutRailTarget(target) {
  if (!target) return;

  const grouped = groupEventsByRound(events);
  const visibleRounds = getVisibleRounds(state, events);

  target.innerHTML = "";

  visibleRounds.forEach(round => {
    const row = document.createElement("div");
    row.className = "rail-row";

    const roundLabel = document.createElement("div");
    roundLabel.className = "rail-round";
    roundLabel.textContent = formatRoundLabel(round);

    const eventsWrap = document.createElement("div");
    eventsWrap.className = "rail-events";

    (grouped[round] || []).forEach(e => {
      const chip = document.createElement("span");

      if (e.type === "round_start") {
        chip.className = "rail-chip setup";
        chip.textContent = `START ${e.position}`;
      } else {
        chip.className = "rail-chip " + (e.side === "athlete" ? "green" : "red");

        const eventLabel = e.short || e.code.toUpperCase();

        chip.textContent = e.points ? `${eventLabel} +${e.points}` : eventLabel;
        chip.title = `${e.clock} • ${formatSide(e.side)} • ${e.label}`;
      }

      chip.addEventListener("click", () => {
        const video = getVideoTarget();
        if (!video || typeof e.videoTime !== "number") return;

        video.currentTime = e.videoTime;
        video.play();
      });

      eventsWrap.appendChild(chip);
    });

    row.appendChild(roundLabel);
    row.appendChild(eventsWrap);
    target.appendChild(row);
  });
}

function renderBoutRail() {
  renderBoutRailTarget(boutRailEl);
  renderBoutRailTarget(reviewBoutRailEl);
}

function renderControls() {
  if (matchFormatSelect && !matchFormatSelect.dataset.ready) {
    Object.entries(MATCH_FORMATS).forEach(([key, format]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = format.label;
      matchFormatSelect.appendChild(option);
    });

    matchFormatSelect.value = state.formatKey;
    matchFormatSelect.dataset.ready = "true";
  }
}

function renderChoicePanel() {
  if (!choicePanel) return;

  const label = document.getElementById("choiceOwnerLabel");
  const buttons = choicePanel.querySelectorAll("[data-choice]");

document.querySelectorAll("[data-code]").forEach(btn => {
  btn.disabled = state.resultLocked || !!state.pendingChoice || mode === "review";
});

  if (!state.pendingChoice) {
    choicePanel.classList.add("hidden");
    choicePanel.classList.remove("red-choice", "green-choice");
    return;
  }

  choicePanel.classList.remove("hidden");

  const chooser = state.pendingChoice.chooser;

  if (chooser === "athlete") {
    label.textContent = "GREEN CHOICE";
  } else if (chooser === "opponent") {
    label.textContent = "RED CHOICE";
  } else {
    label.textContent = "CHOICE";
  }

  choicePanel.classList.remove("red-choice", "green-choice");

  if (chooser === "athlete") {
    choicePanel.classList.add("green-choice");
  } else if (chooser === "opponent") {
    choicePanel.classList.add("red-choice");
  }

  const allowed = state.pendingChoice.options || [];

  buttons.forEach(btn => {
    const val = btn.dataset.choice;
    btn.style.display = allowed.includes(val) ? "inline-block" : "none";
  });
}

function renderAll() {
  updateClock();
  updateScores();
  updatePositionIndicator(); // 
   if (consoleMode === "compact") {
    updateCompactVisibility();
  }

  updateRoundDisplay();
  updateIdentityStrip();
  syncAutoResult();
  updateReviewResult();
  renderEvents();
  renderBoutBoard();
  renderBoutRail();
  renderControls();
  renderChoicePanel();
  updateMatchSummary();
  syncSummaryButtons();
}

/* PAYLOAD */
function buildMatchPayload(videoUrl = "") {
  return {
    id: Date.now(),
    eventName: eventNameInput?.value.trim() || "",
    weightClass: weightClassInput?.value.trim() || "",
    formatKey: state.formatKey,
    formatLabel: state.format.label,
    athlete: athleteNameInput?.value.trim() || "Athlete B",
    opponent: opponentNameInput?.value.trim() || "Athlete A",
    greenTeam: greenTeamInput?.value.trim() || "",
    redTeam: redTeamInput?.value.trim() || "",
    athleteScore: state.athleteScore,
    opponentScore: state.opponentScore,
    currentRound: state.currentRound,
    roundStarts: state.roundStarts,
    choiceHistory: state.choiceHistory,
    position: state.position,
    winner: state.winner,
    resultType: state.resultType,
    clock: formatTime(state.time),
    timeRemaining: state.time,
    rounds: getVisibleRounds(state, events),
    events,
    notes: document.getElementById("coachNotes")?.value.trim() || "",
    videoUrl,
    savedAt: new Date().toISOString(),
    source: "coach-console"
  };
}

function saveLocalDraft() {
  localStorage.setItem(
    "coach_console_active_match",
    JSON.stringify(buildMatchPayload())
  );
}

/* MODE */
function setMode(newMode) {
  if (newMode === "review" && mediaRecorder && mediaRecorder.state === "recording") {
    alert("Pause or finish recording before entering review mode.");
    return;
  }

  mode = newMode;

  liveBtn?.classList.toggle("active", mode === "live");
  reviewBtn?.classList.toggle("active", mode === "review");
  document.body.classList.toggle("review-mode", mode === "review");

  if (mode === "review") {
    setStatus("Review mode");
    if (preview) preview.controls = true;
    if (reviewPreview) reviewPreview.controls = true;
  } else {
    setStatus("Live mode");
    if (preview) preview.controls = false;
  }

  renderAll();
}

liveBtn?.addEventListener("click", () => setMode("live"));
reviewBtn?.addEventListener("click", () => setMode("review"));

/* FORMAT */
matchFormatSelect?.addEventListener("change", e => {
  setMatchFormat(state, e.target.value);
  state.position = "neutral";
  events = [];
  resetClock();
  renderAll();
  saveLocalDraft();
});

/* MATCH SETUP */
confirmMatchSetupBtn?.addEventListener("click", () => {
  matchConfirmed = true;
  state.position = "neutral";

  updateIdentityStrip();
  lockMatchSetup(true);
  matchSetupEl?.classList.add("hidden");

updateStartButton("Start", true);
    
  setStatus("Match confirmed — ready to start");
  saveLocalDraft();
});

/* START */
startBtn?.addEventListener("click", async () => {

    if (!matchConfirmed) {
    setStatus("Confirm match before starting");
    return;
  }
  try {
    // --- CAMERA (only runs on user click) ---
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false // safer for iPhone
      });

      if (preview) {
        preview.srcObject = stream;
        preview.controls = false;
      }

      chunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const videoUrl = URL.createObjectURL(blob);

        if (preview) {
          preview.srcObject = null;
          preview.src = videoUrl;
          preview.controls = true;
        }

        if (reviewPreview) {
          reviewPreview.srcObject = null;
          reviewPreview.src = videoUrl;
          reviewPreview.controls = true;
        }

        const reader = new FileReader();

reader.onloadend = () => {
  const base64Video = reader.result;

  localStorage.setItem(
    "coach_console_last_match",
    JSON.stringify(buildMatchPayload(base64Video))
  );
};

reader.readAsDataURL(blob);


        setStatus("Recording saved locally.");
        updateStartButton("Start", false);
      };

      mediaRecorder.start();

      setStatus("Camera ready.");
    }

    // --- CLOCK (separate, always runs on click) ---
    startClock();
    updateStartButton("Running", true);
    setStatus(`${formatRoundLabel(state.currentRound)} started`);

  } catch (err) {
    console.error("Camera error:", err);
    setStatus("Camera access failed.");
  }
});
greenChooserBtn?.addEventListener("click", () => {
  setSecondPeriodFirstChooser(state, "athlete");
  chooserPanel?.classList.add("hidden");
  renderAll();
  saveLocalDraft();
});

redChooserBtn?.addEventListener("click", () => {
  setSecondPeriodFirstChooser(state, "opponent");
  chooserPanel?.classList.add("hidden");
  renderAll();
  saveLocalDraft();
});

/* PAUSE */
pauseBtn?.addEventListener("click", () => {
  stopClock("Match paused");
  pauseVideoCapture();
  updateStartButton("Resume", false);
});

/* STOP */
stopBtn?.addEventListener("click", () => {
  clearInterval(state.timer);
  state.timer = null;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  stopCameraStream();
  mediaRecorder = null;

  updateStartButton("Start", false);
  setStatus("Match stopped — open Match Summary");

  syncAutoResult();

  matchSummaryModal?.classList.remove("hidden");

  renderAll();
  saveLocalDraft();
});

/* RESET CLOCK */
resetBtn?.addEventListener("click", resetClock);

/* RESET MATCH */
resetMatchBtn?.addEventListener("click", () => {
  clearInterval(state.timer);
  state.timer = null;

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  stopCameraStream();
  mediaRecorder = null;
  chunks = [];

  events = [];

  state.athleteScore = 0;
  state.opponentScore = 0;
  state.currentRound = "1";
  state.roundStarts = { "1": "neutral" };
  state.choiceHistory = [];
  state.winner = null;
  state.resultType = null;
  state.resultLocked = false;
  state.pendingChoice = null;
  state.position = "neutral";
  state.time = getRoundSeconds(state, state.currentRound);

  matchConfirmed = false;
  lockMatchSetup(false);
  matchSetupEl?.classList.remove("hidden");
  chooserPanel?.classList.add("hidden");
  choicePanel?.classList.add("hidden");

  if (preview) {
    preview.srcObject = null;
    preview.removeAttribute("src");
    preview.load();
  }

  if (reviewPreview) {
    reviewPreview.removeAttribute("src");
    reviewPreview.load();
  }

  updateStartButton("Start", false);
  setStatus("Match reset — confirm match");

  renderAll();
  saveLocalDraft();
});

/* MATCH ACTIONS */
matchActionsBtn?.addEventListener("click", () => {
  matchActionsPanel?.classList.toggle("hidden");
});

/* MANUAL NEXT ROUND */
manualNextRoundBtn?.addEventListener("click", () => {
  handleRoundComplete();
});

/* ROUND CHOICE */
choicePanel?.querySelectorAll("[data-choice]").forEach(btn => {
  btn.addEventListener("click", () => {
    const choice = btn.dataset.choice;

    const applied = applyRoundChoice(state, choice);
    if (!applied) return;

    const startPosition = state.roundStarts[state.currentRound];
    setPositionFromRoundStart(startPosition);

    events.push(createRoundStartEvent({
      state,
      round: state.currentRound,
      position: startPosition,
      videoTime: preview?.currentTime || 0
    }));

    pauseVideoCapture();
    updateStartButton("Start", false);
    setStatus(`${formatRoundLabel(state.currentRound)} ready — press Start`);

    renderAll();
    saveLocalDraft();
  });
});

/* CLOCK ADJUST */
toggleAdjustClockBtn?.addEventListener("click", () => {
  adjustClockPanel?.classList.toggle("hidden");
});

document.querySelectorAll("[data-adjust-time]").forEach(btn => {
  btn.addEventListener("click", () => {
    adjustClock(Number(btn.dataset.adjustTime || 0));
  });
});

/* SCORE ADJUST */
toggleAdjustScoreBtn?.addEventListener("click", () => {
  adjustScorePanel?.classList.toggle("hidden");
});

document.querySelectorAll("[data-adjust-score]").forEach(btn => {
  btn.addEventListener("click", () => {
    const side = btn.dataset.adjustScoreSide;
    const val = Number(btn.dataset.adjustScore);

    if (!side || !val) return;

    if (side === "athlete") {
      state.athleteScore = Math.max(0, state.athleteScore + val);
    } else if (side === "opponent") {
      state.opponentScore = Math.max(0, state.opponentScore + val);
    }

    renderAll();
    saveLocalDraft();
    setStatus("Score adjusted");
  });
});

/* SCORING */
document.querySelectorAll("[data-code]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!matchConfirmed) {
      setStatus("Confirm match before scoring");
      return;
    }

    if (mode === "review") return;

    if (state.pendingChoice) {
      setStatus("Choose start position first");
      return;
    }

    const side = btn.dataset.side;
    const code = btn.dataset.code;
    const rule = SCORING_RULES[code];

    if (!rule) return;

    if (!isValidAction(state.position, side, code)) {
      setStatus(getInvalidMessage(state.position, side));
      return;
    }

    applyScore(state, side, rule.points);
    updatePositionAfterScore(state, side, code);

    checkTechFall();

    events.push(createScoreEvent({
      state,
      side,
      code,
      rule,
      videoTime: preview?.currentTime || 0
    }));

    renderAll();
    saveLocalDraft();

    btn.style.transform = "scale(.95)";
    setTimeout(() => {
      btn.style.transform = "";
    }, 90);
  });
});
/* REF CALLS */
document.querySelectorAll("[data-ref-call]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!matchConfirmed) {
      setStatus("Confirm match before ref calls");
      return;
    }

    if (mode === "review") return;

    const side = btn.dataset.side;
    const callType = btn.dataset.refCall;

    const result = handleRefProgression(state, side, callType);

    if (result?.dq) {
      setMatchResult(state, result.winner, "dq", true);
      stopClock("DQ — match stopped");
      pauseVideoCapture();
      updateStartButton("Start", false);
      matchSummaryModal?.classList.remove("hidden");
    }

    events.push(createRefCallEvent({
      state,
      side,
      callType,
      result,
      videoTime: preview?.currentTime || 0
    }));

    checkTechFall();
    setStatus(result?.message || "Ref call recorded");

    renderAll();
    saveLocalDraft();
  });
});

/* UNDO */
document.getElementById("undoBtn")?.addEventListener("click", () => {
  const last = events.pop();
  if (!last) return;

  if (last.type === "score") {
    undoScore(state, last.side, last.points);
  }

  // position rebuild is intentionally simple for v1
  state.position = events.reduce((pos, e) => {
    if (e.type !== "score") return pos;
    if (e.code === "td3") return e.side === "athlete" ? "green_top" : "red_top";
    if (e.code === "esc1") return "neutral";
    if (e.code === "rev2") return e.side === "athlete" ? "green_top" : "red_top";
    return pos;
  }, "neutral");

  renderAll();
  saveLocalDraft();
});

/* MATCH SUMMARY */
closeMatchSummaryBtn?.addEventListener("click", () => {
  matchSummaryModal?.classList.add("hidden");
});

document.querySelectorAll("[data-winner]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-winner]").forEach(b => {
      b.classList.remove("active");
    });

    btn.classList.add("active");

    setMatchResult(state, btn.dataset.winner, state.resultType, true);
    renderAll();
    saveLocalDraft();
  });
});

document.querySelectorAll("[data-finish-type]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-finish-type]").forEach(b => {
      b.classList.remove("active");
    });

    btn.classList.add("active");

    setMatchResult(state, state.winner, btn.dataset.finishType, true);

    if (btn.dataset.finishType === "pin") {
      showFinishFlash("PIN", state.winner);
    }

    if (btn.dataset.finishType === "major") {
      showFinishFlash("MAJOR", state.winner);
    }

    renderAll();
    saveLocalDraft();
  });
});

/* FINISH & SAVE */
finishBtn?.addEventListener("click", () => {
  stopClock("Match finished");

  if (!state.winner || !state.resultType) {
    setStatus("Choose winner and win type before saving");
    matchSummaryModal?.classList.remove("hidden");
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  stopCameraStream();

  const match = buildMatchPayload();
  const logs = JSON.parse(localStorage.getItem("coach_match_logs") || "[]");
  logs.push(match);

  localStorage.setItem("coach_match_logs", JSON.stringify(logs));
  localStorage.setItem("coach_console_last_match", JSON.stringify(match));

  matchSummaryModal?.classList.add("hidden");

setStatus("Match saved.");

const shouldFlash = ["pin", "tech"].includes(state.resultType);

if (shouldFlash) {
  showFinishFlash(getResultLabel(state.resultType).toUpperCase(), state.winner);

  setTimeout(() => {
    setMode("review");
    renderAll();
  }, 900);
} else {
  setMode("review");
  renderAll();
}
});
/* ARENA MODE */
const arenaModeToggle = document.getElementById("arenaModeToggle");

arenaModeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("arena-mode");

  const isArena = document.body.classList.contains("arena-mode");
  arenaModeToggle.textContent = isArena ? "Normal" : "Arena";
});

/* INIT */
renderControls();
renderAll();
saveLocalDraft();
setMode("live");
updateStartButton("Start", true);