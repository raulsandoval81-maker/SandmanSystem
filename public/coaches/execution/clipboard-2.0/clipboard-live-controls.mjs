// Clipboard is a remote controller, never a second execution clock.
import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { coachLoginUrl, isCoachAuthenticationError, requireCoach } from "/assets/js/coach-guard.js";
import { buildExecutionCommand } from "/coaches/execution/engine/practice-remote-control.mjs";

const sessionKey = "sandman_session_builder_v1";
const readSession = () => {
  try { return JSON.parse(localStorage.getItem(sessionKey) || "{}"); } catch { return {}; }
};
const root = document.getElementById("clipboardLiveControls");
const primary = document.getElementById("clipboardLivePrimary");
const drill = document.getElementById("clipboardNextDrill");
const block = document.getElementById("clipboardNextBlock");
const status = document.getElementById("clipboardLiveStatus");
const time = document.getElementById("clipboardLiveTime");
const clockLabel = document.getElementById("clipboardLiveClockLabel");
let practice = null;
let version = 0;
let pending = false;
let active = false;
const fmt = n => {
  const seconds = Math.max(0, Math.floor(Number(n) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
function nextDrill(memory, state) {
  const blocks = Array.isArray(memory?.plannedBlocks) ? memory.plannedBlocks : [];
  const current = blocks[Number(state.index || 0)];
  const drills = Array.isArray(current?.drillBlocks) ? current.drillBlocks : [];
  const index = drills.findIndex(item => String(item.drillId) === String(state.drillId || ""));
  if (index < 0 || index + 1 >= drills.length) return null;
  return { blockId: String(current.blockId || ""), drillId: String(drills[index + 1].drillId || "") };
}
function render() {
  const control = practice?.sessionMemory?.executionControl || {};
  const state = control.state || {};
  const running = state.running === true;
  const paused = state.paused === true;
  const complete = state.complete === true;
  const awaiting = Number(control.appliedVersion || 0) < Number(control.version || 0);
  const memory = practice?.sessionMemory || {};
  const hasPlan = Number(memory.planVersion || 0) > 0;
  const ready = Boolean(practice && hasPlan && state.sessionId && !complete && !awaiting && !pending);
  root.hidden = !hasPlan;
  time.textContent = state.sessionId ? fmt(state.remainingSeconds) : "--:--";
  clockLabel.textContent = state.sessionId ? (paused ? "Paused · Big Clock" : running ? "Last reported · Big Clock" : complete ? "Complete · Big Clock" : "Ready · Big Clock") : "Waiting for Big Clock";
  primary.textContent = complete ? "Practice Complete" : paused ? "Resume" : running ? "Pause" : "Start";
  primary.dataset.command = paused ? "resume" : running ? "pause" : "start";
  primary.disabled = !ready;
  drill.disabled = !ready || (!running && !paused) || !nextDrill(memory, state);
  block.disabled = !ready || (!running && !paused) || Number(state.index || 0) >= (memory.plannedBlocks || []).length - 1;
  status.textContent = awaiting ? "Waiting for Big Clock acknowledgment…" :
    pending ? "Sending to Big Clock…" :
    complete ? "Practice completed." :
    state.sessionId ? `${paused ? "Paused" : running ? "Running" : "Ready"} · Block ${Number(state.index || 0) + 1} · Big Clock last reported ${fmt(state.remainingSeconds)} remaining` :
    "Waiting for Big Clock to publish live state. Open Big Clock first.";
}
async function refresh() {
  const session = readSession();
  if (!session.practiceId || !active || pending) return;
  try {
    const result = await httpsCallable(functions, "getPracticeSession")({ practiceId: session.practiceId });
    practice = result.data?.practice || null;
    version = Number(practice?.sessionMemory?.executionControl?.version || 0);
    render();
  } catch (error) {
    primary.disabled = drill.disabled = block.disabled = true;
    status.textContent = `Unable to read live practice: ${error?.message || "connection error"}`;
  }
}
async function send(type) {
  if (!practice || pending) return;
  const session = readSession();
  const control = practice.sessionMemory?.executionControl || {};
  const state = control.state || {};
  const identity = nextDrill(practice.sessionMemory, state);
  if (type === "switch-drill" && !identity) return;
  pending = true;
  render();
  try {
    const cmd = buildExecutionCommand({
      commandId: crypto.randomUUID(),
      practiceId: session.practiceId,
      sessionId: practice.liveSessionId,
      planVersion: practice.sessionMemory.planVersion,
      type,
      blockId: type === "switch-drill" ? identity.blockId : "",
      drillId: type === "switch-drill" ? identity.drillId : ""
    });
    await httpsCallable(functions, "savePracticeSessionMemory")({
      operation: "execution-command", practiceId: session.practiceId,
      expectedVersion: version, command: cmd
    });
    status.textContent = "Command accepted. Waiting for Big Clock…";
  } catch (error) {
    status.textContent = `Command rejected: ${error?.message || "reload practice state"}`;
  } finally {
    pending = false;
    // Refresh authoritative state; never optimistically advance a second clock.
    await refresh();
  }
}
primary.addEventListener("click", () => send(primary.dataset.command));
drill.addEventListener("click", () => send("switch-drill"));
block.addEventListener("click", () => send("advance"));
try {
  await requireCoach();
  active = true;
  render();
  await refresh();
  // Poll Firestore through the existing canonical callable; no client countdown.
  setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 1500);
} catch (error) {
  root.hidden = true;
  if (isCoachAuthenticationError(error)) {
    window.location.replace(coachLoginUrl(window.location.pathname + window.location.search + window.location.hash));
  } else {
    status.textContent = error?.message || "Coach authorization required.";
  }
}
