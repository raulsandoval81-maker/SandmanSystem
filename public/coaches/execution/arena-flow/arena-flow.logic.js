import { db, doc, setDoc, serverTimestamp } from "/assets/js/firebase-init.js";

const totalTimeEl = document.getElementById("totalTime");
const saveStatusEl = document.getElementById("saveStatus");

const inlineClockEl = document.getElementById("inlineClock");
const inlineRunStatusEl = document.getElementById("inlineRunStatus");
const inlineCurrentBlockEl = document.getElementById("inlineCurrentBlock");
const inlinePauseBtn = document.getElementById("inlinePauseBtn");
const inlineStopBtn = document.getElementById("inlineStopBtn");
const inlineRunbarEl = document.getElementById("inlineRunbar");

/* =========================
   INLINE RUN STATE
========================= */
const INLINE_RUN = {
  playlist: [],
  index: 0,
  secondsLeft: 0,
  totalSecondsLeft: 0,
  timerId: null,
  paused: false,
  running: false,
  completedSlots: new Set()
};

function hasInlineRunner() {
  return !!(inlineClockEl && inlineRunStatusEl && inlineCurrentBlockEl && inlineRunbarEl);
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setInlineRunState(state) {
  if (!inlineRunbarEl) return;

  inlineRunbarEl.classList.remove("running", "paused", "stopped");
  inlineRunbarEl.classList.add(state);

  if (inlineRunStatusEl) inlineRunStatusEl.textContent = state;
}

function updateTotalClockDisplay() {
  if (!totalTimeEl) return;

  if (INLINE_RUN.running || INLINE_RUN.paused) {
    totalTimeEl.textContent = "";
    return;
  }

  recalcTotal();
}
function clearRunningHighlights() {
  document.querySelectorAll(".plan-block").forEach(el => {
    el.classList.remove("running-now");
  });
}

function resetBlockClocksToPlannedTime() {
  document.querySelectorAll(".plan-block:not(.hidden)[data-slot]").forEach(block => {
    const clock = block.querySelector(".mini-clock");
    const minutes = Number(block.dataset.minutes || 0);

    if (!clock) return;
    clock.textContent = `${String(minutes).padStart(2, "0")}:00`;
  });
}

function buildInlinePlaylist() {
  return [...document.querySelectorAll(".plan-block:not(.hidden)[data-slot]")]
    .map(block => ({
      el: block,
      slot: block.dataset.slot,
      title: block.querySelector(".block-title")?.textContent?.trim() || block.dataset.slot,
      minutes: Number(block.dataset.minutes || 0)
    }))
    .filter(item => item.minutes > 0);
}

function syncInlineDisplay() {
  if (!hasInlineRunner()) return;

  inlineClockEl.textContent = formatClock(INLINE_RUN.secondsLeft);

  const current = INLINE_RUN.playlist[INLINE_RUN.index];

  inlineCurrentBlockEl.textContent = current
    ? `${current.title} • ${current.minutes} min`
    : "No active block.";

  clearRunningHighlights();

  document.querySelectorAll(".plan-block:not(.hidden)[data-slot]").forEach(block => {
    const clock = block.querySelector(".mini-clock");
    const minutes = Number(block.dataset.minutes || 0);
    const slot = block.dataset.slot;

    if (!clock) return;

    if (current && slot === current.slot) {
      block.classList.add("running-now");
      clock.textContent = formatClock(INLINE_RUN.secondsLeft);
    } else if (INLINE_RUN.completedSlots.has(slot)) {
      clock.textContent = "00:00";
    } else {
      clock.textContent = `${String(minutes).padStart(2, "0")}:00`;
    }
  });
}

function advanceInlineBlock() {
  const finished = INLINE_RUN.playlist[INLINE_RUN.index];
  if (finished?.slot) INLINE_RUN.completedSlots.add(finished.slot);

  INLINE_RUN.index += 1;

  if (INLINE_RUN.index >= INLINE_RUN.playlist.length) {
    stopInlineArenaFlow(true);
    return;
  }

  INLINE_RUN.secondsLeft = INLINE_RUN.playlist[INLINE_RUN.index].minutes * 60;
  setInlineRunState("running");
  syncInlineDisplay();
}

function tickInlineArenaFlow() {
  if (!INLINE_RUN.running || INLINE_RUN.paused) return;

  INLINE_RUN.secondsLeft -= 1;
  INLINE_RUN.totalSecondsLeft -= 1;

  if (INLINE_RUN.totalSecondsLeft < 0) INLINE_RUN.totalSecondsLeft = 0;

  if (INLINE_RUN.secondsLeft <= 0) {
    advanceInlineBlock();
    updateTotalClockDisplay();
    return;
  }

  syncInlineDisplay();
  updateTotalClockDisplay();
}

function startInlineArenaFlow() {
  if (!hasInlineRunner()) return false;

  if (!INLINE_RUN.running) {
    INLINE_RUN.playlist = buildInlinePlaylist();
    INLINE_RUN.index = 0;
    INLINE_RUN.completedSlots = new Set();

    if (!INLINE_RUN.playlist.length) {
      if (saveStatusEl) saveStatusEl.textContent = "No visible blocks to run.";
      return true;
    }

    INLINE_RUN.totalSecondsLeft = INLINE_RUN.playlist.reduce(
      (sum, item) => sum + (item.minutes * 60),
      0
    );

    INLINE_RUN.secondsLeft = INLINE_RUN.playlist[0].minutes * 60;
    INLINE_RUN.running = true;
    INLINE_RUN.paused = false;

    setInlineRunState("running");
    syncInlineDisplay();
    updateTotalClockDisplay();

    INLINE_RUN.timerId = setInterval(tickInlineArenaFlow, 1000);
    return true;
  }

  if (INLINE_RUN.paused) {
    INLINE_RUN.paused = false;
    setInlineRunState("running");
    updateTotalClockDisplay();
    return true;
  }

  return true;
}

function pauseInlineArenaFlow() {
  if (!INLINE_RUN.running) return;
  INLINE_RUN.paused = true;
  setInlineRunState("paused");
}

function stopInlineArenaFlow(finished = false) {
  INLINE_RUN.running = false;
  INLINE_RUN.paused = false;

  if (INLINE_RUN.timerId) {
    clearInterval(INLINE_RUN.timerId);
    INLINE_RUN.timerId = null;
  }

  INLINE_RUN.playlist = [];
  INLINE_RUN.index = 0;
  INLINE_RUN.secondsLeft = 0;
  INLINE_RUN.totalSecondsLeft = 0;
  INLINE_RUN.completedSlots = new Set();

  clearRunningHighlights();

  if (finished) {
    resetBlockClocksToPlannedTime();
  }

  if (inlineClockEl) inlineClockEl.textContent = "00:00";
  if (inlineCurrentBlockEl) {
    inlineCurrentBlockEl.textContent = finished ? "Arena flow complete." : "No active block.";
  }

  setInlineRunState("stopped");

  if (inlineRunStatusEl && finished) {
    inlineRunStatusEl.textContent = "complete";
  }

  if (finished) {
    totalTimeEl.textContent = "Total timed: 00:00";
  } else {
    recalcTotal();
  }
}

/* =========================
   TOTAL TIME
========================= */
function recalcTotal() {
  const mins = [...document.querySelectorAll("[data-minutes]")]
    .reduce((sum, b) => sum + Number(b.dataset.minutes || 0), 0);

  totalTimeEl.textContent = "Total timed: " + String(mins).padStart(2, "0") + ":00";
  totalTimeEl.classList.toggle("over", mins > 60);
}

/* =========================
   INPUT HANDLING
========================= */
document.addEventListener("input", e => {
  const inp = e.target.closest(".min-input");
  if (!inp) return;

  const blk = inp.closest(".plan-block");
  if (inp.readOnly) return;

  let v = Number(inp.value || 0);
  if (v < 1) v = 1;
  if (v > 30) v = 30;

  inp.value = v;
  blk.dataset.minutes = v;

  const clock = blk.querySelector(".mini-clock");
  if (clock) {
    const mm = String(v).padStart(2, "0");
    clock.textContent = mm + ":00";
  }

  recalcTotal();
});

/* =========================
   MINI TIMERS
========================= */
const miniTimers = new Map();

function toClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

document.addEventListener("click", e => {
  const play = e.target.closest(".mini-play");
  const stop = e.target.closest(".mini-stop");

  if (play) {
    const head = play.closest(".block-head-row");
    const inp = head.querySelector(".min-input");
    const clock = head.querySelector(".mini-clock");

    const mins = Number(inp.value || 0);
    const totalSecs = mins * 60;

    if (miniTimers.has(head)) {
      clearInterval(miniTimers.get(head));
    }

    let left = totalSecs;
    clock.textContent = toClock(left);

    const id = setInterval(() => {
      left--;
      if (left <= 0) {
        left = 0;
        clearInterval(id);
      }
      clock.textContent = toClock(left);
    }, 1000);

    miniTimers.set(head, id);
  }

  if (stop) {
    const head = stop.closest(".block-head-row");
    const inp = head.querySelector(".min-input");
    const clock = head.querySelector(".mini-clock");

    if (miniTimers.has(head)) {
      clearInterval(miniTimers.get(head));
    }

    const mins = Number(inp.value || 0);
    clock.textContent = toClock(mins * 60);
  }
});

/* =========================
   SAVE
========================= */
window.savePlan = async function () {
  const payload = {
    bleacher: document.querySelector("#planBlocks .plan-block:nth-child(1) .slot")?.textContent.trim() || "",
    warmup: document.querySelector('#planBlocks [data-slot="warmup"] .slot')?.textContent.trim() || "",
    neutral: document.querySelector('#planBlocks [data-slot="neutral"] .slot')?.textContent.trim() || "",
    top: document.querySelector('#planBlocks [data-slot="top"] .slot')?.textContent.trim() || "",
    bottom: document.querySelector('#planBlocks [data-slot="bottom"] .slot')?.textContent.trim() || "",
    play: document.querySelector('#planBlocks [data-slot="play"] .slot')?.textContent.trim() || "",
    hardgo: document.querySelector('#planBlocks [data-slot="hardgo"] .slot')?.textContent.trim() || "",
    hydrate: document.querySelector("#planBlocks .plan-block:last-child .slot")?.textContent.trim() || "",
    blocks: [...document.querySelectorAll("[data-slot]")].map(b => ({
      slot: b.dataset.slot,
      minutes: Number(b.dataset.minutes || 0),
      text: b.querySelector(".slot")?.textContent.trim() || ""
    })),
    updatedAt: serverTimestamp(),
    source: "arena-flow-clipboard"
  };

  const key = new Date().toISOString().slice(0, 10) + "-arena-flow";

  await setDoc(doc(db, "practicePlans", key), payload, { merge: true });

  saveStatusEl.textContent = "Saved.";
  return key;
};

/* =========================
   TIMER
========================= */
window.openTimerWindow = function () {
  const key = new Date().toISOString().slice(0, 10) + "-arena-flow";
  const url = `/lab/timer-engine/ui/athlete/sandman-coach-timer.html?plan=${encodeURIComponent(key)}`;
  const w = window.open(url, "sandmanTimer", "width=760,height=820");
  if (w) w.focus();
};

window.runArenaFlow = async function () {
  try {
    const key = await window.savePlan();

    const startedInline = startInlineArenaFlow();
    if (startedInline) {
      saveStatusEl.textContent = "Saved and running inline.";
      return;
    }

    const url = `/lab/timer-engine/ui/athlete/sandman-coach-timer.html?plan=${encodeURIComponent(key)}`;
    const w = window.open(url, "sandmanTimer", "width=760,height=820");
    if (w) w.focus();

    saveStatusEl.textContent = "Saved and opened timer.";
  } catch (err) {
    console.error(err);
    saveStatusEl.textContent = "Run failed.";
  }
};

/* =========================
   INIT
========================= */
window.loadDefault = function () {
  saveStatusEl.textContent = "Arena Flow 45 loaded (not saved).";
  recalcTotal();
};

(function init() {
  recalcTotal();
  setInlineRunState("stopped");

  if (inlinePauseBtn) inlinePauseBtn.addEventListener("click", pauseInlineArenaFlow);
  if (inlineStopBtn) inlineStopBtn.addEventListener("click", () => stopInlineArenaFlow(false));
})();