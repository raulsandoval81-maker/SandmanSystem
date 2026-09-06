import { buildShadowTrainingPlan } from "/lab/timer-engine/engine/shadow-sequence-builder.js";
import { ShadowTrainingEngine } from "/lab/timer-engine/engine/shadow-training-engine.js";
import { resolveCombatTrainingPresetFromSearch } from "/lab/timer-engine/engine/combat-training-preset-resolver.js";

const byId = id => document.getElementById(id);
const ui = {
  status: byId("status"), round: byId("roundLabel"), purpose: byId("roundPurpose"),
  action: byId("currentAction"), clock: byId("clock"), cue: byId("coachingCue"),
  next: byId("nextAction"), start: byId("startBtn"), pause: byId("pauseBtn"),
  stop: byId("stopBtn"), completion: byId("completionMessage"), settings: byId("settings"),
  gear: byId("gearBtn"), close: byId("closeSettings"), voice: byId("voiceToggle"),
  volume: byId("volume"), dots: [...document.querySelectorAll(".round-dot")]
};

const preset = resolveCombatTrainingPresetFromSearch(window.location.search);
const plan = buildShadowTrainingPlan(preset);
document.title = `${preset.label} Training`;
document.querySelector(".training-header h1").textContent = preset.label;
let cueGeneration = 0;
let lastAnnouncement = "";

function formatTime(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function cancelCues() {
  cueGeneration += 1;
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}

function speak(text, generation = cueGeneration) {
  if (!ui.voice.checked || !text || generation !== cueGeneration || !("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.volume = Number(ui.volume.value || .9);
    window.speechSynthesis.speak(utterance);
  } catch (_) { /* Spoken coaching is optional. */ }
}

function signal(generation = cueGeneration) {
  if (generation !== cueGeneration) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.value = 880; gain.gain.value = .1;
    oscillator.start(); oscillator.stop(context.currentTime + .12);
    oscillator.addEventListener("ended", () => context.close(), { once: true });
  } catch (_) { /* Timing never depends on audio support. */ }
}

function announce(view) {
  const key = `${view.reason}:${view.state}:${view.roundIndex}:${view.action.actionId}:${view.bottomCountdown ?? ""}`;
  if (key === lastAnnouncement || view.reason === "tick") return;
  lastAnnouncement = key;
  const generation = cueGeneration;
  if (["work-started", "round-started", "action-started"].includes(view.reason)) {
    signal(generation); view.spokenCommands.forEach(command => speak(command, generation));
  } else if (["bottom-cue-started", "bottom-countdown"].includes(view.reason)) {
    view.spokenCommands.forEach(command => speak(command, generation));
  } else if (view.reason === "bottom-action-started") {
    signal(generation);
    view.spokenCommands.forEach(command => speak(command, generation));
  } else if (view.reason === "transition-started") {
    view.spokenCommands.forEach(command => speak(command, generation));
  } else if (view.reason === "rest-started") {
    signal(generation); speak(view.recovery.spokenCommand, generation);
  } else if (view.reason === "short-time") {
    speak("Short time", generation);
  } else if (view.reason === "completed") {
    signal(generation); speak("Training complete", generation);
  }
}

const labels = {
  idle: "READY", preparing: "PREPARE", working: "WORK", transitioning: "TRANSITION",
  resting: "REST", paused: "PAUSED", completed: "COMPLETE", stopped: "STOPPED"
};

function render(view) {
  document.body.dataset.trainingState = view.state;
  if (view.isShortTime) document.body.dataset.shortTime = "true";
  else delete document.body.dataset.shortTime;
  ui.status.textContent = labels[view.state];
  ui.round.textContent = `Round ${view.roundNumber} of ${view.roundCount}`;
  ui.purpose.textContent = view.round.purpose;
  let action = view.action.label;
  let cue = view.action.coachingCue;
  let next = view.action.nextAction;
  if (view.state === "preparing") { action = "Get Ready"; next = view.action.label; }
  if (view.state === "transitioning") {
    if (view.transitionKind === "bottom-lead-in") {
      action = String(view.bottomCountdown);
      cue = `${view.action.label} · ${view.round.commandPattern.executionCommand}`;
      next = view.action.label;
    } else {
      action = view.transitionCommand.label;
      cue = view.transitionCommand.coachingCue;
    }
  }
  if (view.state === "resting") {
    action = view.recovery.label; cue = view.recovery.coachingCue;
    next = plan.rounds[view.roundIndex + 1]?.actions[0]?.label || "Complete";
  }
  if (view.state === "completed") { action = "Training Complete"; cue = "Ten controlled rounds complete."; next = "Recover"; }
  if (view.state === "stopped") { action = "Session Stopped"; cue = "Start again when you are ready."; next = plan.rounds[0].actions[0].label; }
  ui.action.textContent = action; ui.cue.textContent = cue; ui.next.textContent = next;
  ui.clock.textContent = formatTime(view.remaining);
  ui.completion.hidden = view.state !== "completed";

  const active = ["preparing", "working", "transitioning", "resting", "paused"].includes(view.state);
  ui.start.disabled = active;
  ui.start.textContent = ["completed", "stopped"].includes(view.state) ? "Start Again" : "Start";
  ui.pause.disabled = !active; ui.pause.textContent = view.state === "paused" ? "Resume" : "Pause";
  ui.stop.disabled = !active;
  ui.dots.forEach((dot, index) => {
    dot.classList.toggle("is-complete", index < view.roundIndex || view.state === "completed");
    dot.classList.toggle("is-current", index === view.roundIndex && view.state !== "completed");
  });
  announce(view);
}

const engine = new ShadowTrainingEngine(plan, { onChange: render });
ui.start.addEventListener("click", () => { cancelCues(); lastAnnouncement = ""; engine.start(); });
ui.pause.addEventListener("click", () => {
  cancelCues(); engine.state === "paused" ? engine.resume() : engine.pause();
});
ui.stop.addEventListener("click", () => { cancelCues(); engine.stop(); });
ui.gear.addEventListener("click", () => { ui.settings.hidden = false; });
ui.close.addEventListener("click", () => { ui.settings.hidden = true; });
ui.settings.addEventListener("click", event => { if (event.target === ui.settings) ui.settings.hidden = true; });
document.addEventListener("visibilitychange", () => engine.handleVisibilityChange(document.hidden));
window.addEventListener("pagehide", () => { cancelCues(); engine.pause(); });
