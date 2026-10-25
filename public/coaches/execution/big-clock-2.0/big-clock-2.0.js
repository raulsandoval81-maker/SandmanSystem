import { db, ensureSignedIn, doc, getDoc, setDoc, onSnapshot, serverTimestamp, functions, httpsCallable } from "/assets/js/firebase-init.js";
import {
  blockDurationSeconds,
  currentAndNextActivity,
  materializeLiveState,
  totalPracticeProgress,
} from "../engine/live-execution-state.mjs";

const params = new URLSearchParams(window.location.search);
const practiceId = params.get("practiceId") || "";
const sessionId = params.get("session") || params.get("sessionId") || "";
const locationId = params.get("locationId") || "";

const el = (id) => document.getElementById(id);
const clock = el("clock");
const title = el("block-title");
const activity = el("current-activity");
const upcoming = el("upcoming-activity");
const phase = el("interval-phase");
const progress = el("practice-progress");
const progressText = el("practice-progress-text");
const groups = el("group-instructions");
const syncStatus = el("sync-status");
const ready = el("ready-overlay");

let payload = null;
let canonicalState = { status: "ready", revision: 0, index: 0, elapsedSeconds: 0, anchorEpochMs: 0 };
let localTimer = null;
let unsubscribe = null;
let commandPending = false;
let lastAutoAdvanceRevision = -1;
let fastPassMinutes = 60;
let fastPassPlanPrepared = false;
let serverClockOffsetMs = 0;

function acceptCanonicalState(state) {
  canonicalState = state || canonicalState;
  if (Number(canonicalState.updatedAtEpochMs) > 0) {
    serverClockOffsetMs = Date.now() - Number(canonicalState.updatedAtEpochMs);
  }
}

function canonicalNow() {
  return Date.now() - serverClockOffsetMs;
}

function isFastPass() {
  return params.get("fast") === "1";
}

function localBuilderSession() {
  try { return JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}"); }
  catch { return {}; }
}

function renderFastPass() {
  el("fast-duration")?.classList.toggle("hidden", !isFastPass());
  document.querySelectorAll("[data-fast-minutes]").forEach((button) => {
    const active = Number(button.dataset.fastMinutes) === fastPassMinutes;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function prepareFastPassPractice() {
  if (!isFastPass() || fastPassPlanPrepared) return;
  const session = localBuilderSession();
  const block = { blockId:"practice", slot:"practice", title:"Practice", minutes:fastPassMinutes, cards:[], drillBlocks:[], groupActivities:[] };
  const savePracticeSessionMemory = httpsCallable(functions, "savePracticeSessionMemory");
  await savePracticeSessionMemory({ operation:"plan", practiceId, planVersion:1, plannedBlocks:[block], plannedCards:[] });
  payload = {
    source:"session-builder-fast-pass", practiceId, sessionId, blocks:[block], trainingGroups:[],
    discipline:session.discipline || "", journey:session.journey || "", durationMinutes:fastPassMinutes
  };
  await setDoc(doc(db,"liveSessions",sessionId), {
    practiceId, liveSessionId:sessionId, payload, status:"ready",
    updatedAt:serverTimestamp()
  }, { merge:true });
  fastPassPlanPrepared = true;
}

async function startPractice() {
  try {
    await prepareFastPassPractice();
    await sendCommand("start");
  } catch (error) {
    if (syncStatus) syncStatus.textContent = `Could not start practice: ${error?.message || "Unknown error"}`;
  }
}

function playlist() {
  return Array.isArray(payload?.blocks) ? payload.blocks : [];
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function groupLabel(group) {
  if (Array.isArray(group?.athleteNames)) return group.athleteNames.filter(Boolean).join(", ");
  const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
  return athletes.map((athlete) => athlete.displayName || athlete.name || athlete.athleteName).filter(Boolean).join(", ");
}

function groupInstruction(block, group) {
  const assignments = Array.isArray(block?.groupActivities) ? block.groupActivities : [];
  const assignment = assignments.find((candidate) => String(candidate.groupId) === String(group.id || group.groupId));
  const cardTitles = Array.isArray(assignment?.cards) ? assignment.cards.map((card) => card.title).filter(Boolean).join(" · ") : "";
  return assignment?.coachAdjustment || cardTitles || assignment?.title || assignment?.name || assignment?.instruction || block?.instructionalFocus || "Shared room instruction";
}

function renderGroups(block) {
  if (!groups) return;
  groups.replaceChildren();
  for (const group of payload?.trainingGroups || payload?.groups || []) {
    const card = document.createElement("article");
    card.className = "group-card";
    const heading = document.createElement("strong");
    heading.textContent = `${group.label || group.name || group.id || group.groupId}: ${groupLabel(group)}`;
    const instruction = document.createElement("span");
    instruction.textContent = groupInstruction(block, group);
    card.append(heading, instruction);
    groups.append(card);
  }
}

function intervalDescription(block, elapsedSeconds) {
  const timer = block?.timer?.execution || block?.timerPreset || block?.timer || {};
  const work = Number(timer.workSeconds || block?.workSeconds || 0);
  const rest = Number(timer.restSeconds || block?.restSeconds || 0);
  const rounds = Number(timer.rounds || block?.rounds || 0);
  if (!work || !rounds) return block?.timerLabel || "Continuous block";
  const cycle = work + Math.max(0, rest);
  const round = Math.min(rounds, Math.floor(elapsedSeconds / Math.max(1, cycle)) + 1);
  const within = elapsedSeconds % Math.max(1, cycle);
  const resting = rest > 0 && within >= work;
  const remaining = resting ? cycle - within : work - within;
  return `${resting ? "REST" : "WORK"} · Round ${round}/${rounds} · ${formatTime(remaining)}`;
}

function saveLocalSnapshot(state) {
  if (!practiceId || !sessionId) return;
  const scopedState = { ...state, practiceId, sessionId };
  localStorage.setItem(`sandman:big-clock:${practiceId}:${sessionId}`, JSON.stringify(scopedState));
}

function render() {
  const blocks = playlist();
  const state = materializeLiveState(canonicalState, canonicalNow(), blocks);
  const block = blocks[state.index] || null;
  const duration = blockDurationSeconds(block);
  const remaining = Math.max(0, duration - state.elapsedSeconds);
  const activities = currentAndNextActivity(state, blocks, canonicalNow());

  if (clock) clock.textContent = formatTime(remaining);
  if (title) title.textContent = block?.title || (state.status === "completed" ? "Practice complete" : "Ready to begin");
  const activityTitle = (item) => typeof item === "string" ? item : item?.name || item?.title || item?.label || "";
  if (activity) activity.textContent = activityTitle(activities.currentActivity) || "No activity assigned";
  if (upcoming) upcoming.textContent = activities.nextActivity ? `Up next: ${activityTitle(activities.nextActivity)}` : "Final activity";
  if (phase) phase.textContent = intervalDescription(block, state.elapsedSeconds);
  const practiceProgress = totalPracticeProgress(state, blocks);
  const pct = practiceProgress.ratio * 100;
  if (progress) progress.style.width = `${pct}%`;
  if (progressText) progressText.textContent = `${Math.round(pct)}% complete`;
  if (syncStatus && !syncStatus.dataset.conflict) syncStatus.textContent = `Synchronized · revision ${state.revision}`;
  if (ready) ready.classList.toggle("hidden", state.status !== "ready");
  renderGroups(block);
  saveLocalSnapshot(state);
  updateControls(state.status);
  const postPractice = el("post-practice");
  if (postPractice) {
    postPractice.textContent = "Post Practice Input";
    postPractice.classList.toggle("hidden", state.status !== "completed");
    postPractice.href = `/coaches/logs/practice-log.html?practiceId=${encodeURIComponent(practiceId)}${isFastPass() ? "&fast=1" : ""}`;
  }

  if (state.status === "running" && duration > 0 && state.elapsedSeconds >= duration && lastAutoAdvanceRevision !== state.revision) {
    lastAutoAdvanceRevision = state.revision;
    void sendCommand("advance");
  }
}

function updateControls(status) {
  const enabled = (id, value) => { const button = el(id); if (button) button.disabled = commandPending || !value; };
  enabled("control-start", status === "ready");
  enabled("control-pause", status === "running");
  enabled("control-resume", status === "paused");
  enabled("control-back", !["ready"].includes(status) && canonicalState.index > 0);
  enabled("control-repeat", !["ready"].includes(status));
  enabled("control-skip", !["ready", "completed"].includes(status));
  enabled("control-reset", status !== "ready");
}

function beep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.connect(context.destination);
    oscillator.frequency.value = 880;
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  } catch (_) {
    // Audio cues are best effort; execution state remains authoritative.
  }
}

async function sendCommand(command, options = {}) {
  if (!practiceId || !sessionId || commandPending) return;
  commandPending = true;
  updateControls(canonicalState.status);
  if (syncStatus) {
    delete syncStatus.dataset.conflict;
    syncStatus.textContent = "Synchronizing…";
  }
  try {
    const update = httpsCallable(functions, "updatePracticeExecutionState");
    const response = await update({
      practiceId,
      sessionId,
      locationId,
      command,
      expectedRevision: canonicalState.revision,
      confirmReset: Boolean(options.confirmReset),
    });
    acceptCanonicalState(response.data?.state);
    if (["advance", "skip", "back", "repeat"].includes(command)) beep();
    render();
  } catch (error) {
    if (command === "advance") lastAutoAdvanceRevision = -1;
    if (syncStatus) {
      syncStatus.dataset.conflict = "true";
      syncStatus.textContent = /revision|stale|aborted/i.test(error?.message || "")
        ? "Another device changed this practice. Latest state restored; review before retrying."
        : `Control failed: ${error?.message || "Unknown error"}`;
    }
  } finally {
    commandPending = false;
    updateControls(canonicalState.status);
  }
}

function bindControls() {
  el("control-start")?.addEventListener("click", () => sendCommand("start"));
  el("control-pause")?.addEventListener("click", () => sendCommand("pause"));
  el("control-resume")?.addEventListener("click", () => sendCommand("resume"));
  el("control-skip")?.addEventListener("click", () => sendCommand("skip"));
  el("control-back")?.addEventListener("click", () => sendCommand("back"));
  el("control-repeat")?.addEventListener("click", () => sendCommand("repeat"));
  el("control-reset")?.addEventListener("click", () => {
    if (window.confirm("Reset this live practice? Elapsed execution evidence will be retained in the audit trail.")) {
      void sendCommand("reset", { confirmReset: true });
    }
  });
  el("fullscreen")?.addEventListener("click", () => document.documentElement.requestFullscreen?.());
  el("begin-practice")?.addEventListener("click", () => startPractice());
  document.querySelectorAll("[data-fast-minutes]").forEach((button) => button.addEventListener("click", () => {
    fastPassMinutes = Number(button.dataset.fastMinutes) || 60;
    renderFastPass();
  }));
}

async function hydrate() {
  await ensureSignedIn();
  if (!practiceId || !sessionId) throw new Error("Big Clock requires practiceId and sessionId.");
  const reference = doc(db, "liveSessions", sessionId);
  const initial = await getDoc(reference);
  if (!initial.exists()) throw new Error("Live session not found.");
  const initialPayload = initial.data();
  if (initialPayload.practiceId !== practiceId) throw new Error("Live session does not match this practice.");
  payload = initialPayload.payload || initialPayload;
  fastPassPlanPrepared = isFastPass() && Array.isArray(payload.blocks) && payload.blocks.length > 0;
  if (isFastPass() && !Array.isArray(payload.blocks)) {
    const session = localBuilderSession();
    fastPassMinutes = Number(session.durationMinutes || 60);
    payload = { source:"session-builder-fast-pass", practiceId, sessionId, blocks:[{blockId:"practice",slot:"practice",title:"Practice",minutes:fastPassMinutes,cards:[],drillBlocks:[],groupActivities:[]}], trainingGroups:[] };
  }
  acceptCanonicalState(initialPayload.runState);
  unsubscribe = onSnapshot(reference, (snapshot) => {
    if (!snapshot.exists()) return;
    const next = snapshot.data();
    if (next.practiceId !== practiceId) return;
    payload = next.payload || next;
    acceptCanonicalState(next.runState);
    render();
  }, (error) => {
    if (syncStatus) syncStatus.textContent = `Synchronization unavailable: ${error.message}`;
  });
  render();
  localTimer = window.setInterval(render, 250);
}

bindControls();
renderFastPass();
hydrate().catch((error) => {
  if (syncStatus) syncStatus.textContent = error.message;
});

window.addEventListener("beforeunload", () => {
  if (localTimer) window.clearInterval(localTimer);
  unsubscribe?.();
});
