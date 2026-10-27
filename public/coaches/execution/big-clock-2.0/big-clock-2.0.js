import {
  db,
  ensureSignedIn,
  doc,
  setDoc,
  serverTimestamp,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { executableCardsForBlock } from "/coaches/execution/session-builder/hybrid-planning-policy.js";
import { practiceRunIdentity, restorePracticeRun } from "/coaches/execution/engine/big-clock-state-identity.mjs";
import {
  getActiveCombatInterval,
  getActiveInnerDrill,
  getRunElapsedSeconds,
  pauseRunClock,
  resumeRunClock,
  seekRunClock
} from "/coaches/execution/engine/practice-execution-contract.mjs";
import {
  completedExecutionMilestones,
  createObservationQueue,
  executionObservation,
  resolveNextPlanVersion
} from "/coaches/execution/engine/practice-execution-actuals.mjs";
import { applyExecutionCommand, controllerSnapshot } from "/coaches/execution/engine/practice-remote-control.mjs";

const SESSION_PARAM = String(new URLSearchParams(window.location.search).get("session") || "").trim();
const STATE_KEY = "sandman_run_state";
const PAYLOAD_KEY = "sandman_big_clock_payload_v2";
const TV_SCALE_KEY = "sandman_tv_scale";
const OBSERVATION_QUEUE_PREFIX = "sandman_execution_observation_queue_v1:";
const OBSERVATION_SYNC_PREFIX = "sandman_execution_observation_sync_v1:";
const OBSERVATION_SEQUENCE_PREFIX = "sandman_execution_observation_sequence_v1:";

let authReady = false;
let audioCtx = null;
let lastBeepKey = "";
let fastPassMinutes = 60;
let observationQueue = null;
let observationQueueKey = "";
let remoteControlVersion = 0;
let remoteControlPoll = false;

function compactWorkedCard(card, blockId, index) {
  const item = typeof card === "object" && card ? card : { title: String(card || "") };
  return {
    cardId: item.id || item.href || item.skill || item.family || `${blockId}-${index}-${item.title || "card"}`,
    blockId,
    title: item.title || "",
    href: item.href || "",
    skillId: item.skill || "",
    familyId: item.familyId || item.family || "",
    discipline: item.discipline || "",
    groupId: item.groupId || "",
    athleteIds: Array.isArray(item.athleteIds) ? item.athleteIds : []
  };
}

async function updateDurableWorkedMemory({ block = null, started = false, completed = false } = {}) {
  const payload = getPayload();
  const session = getSessionPayload();
  const practiceId = String(payload.practiceId || session.practiceId || "").trim();
  if (!practiceId) return;
  if (!authReady) {
    await ensureSignedIn();
    authReady = true;
  }
  const blockId = block ? String(block.slot || block.blockId || block.title || "").trim() : "";
  const cards = block
    ? executableCardsForBlock(block).map((card, index) => compactWorkedCard(card, blockId, index))
    : [];
  const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
  await saveMemory({
    operation: "worked",
    practiceId,
    executionStarted: started,
    executionCompleted: completed,
    workedBlocks: block ? [{ blockId, title: block.title || blockId, minutes: Number(block.minutes || 0), cards }] : [],
    workedCards: cards
  });
}

function renderObservationSyncStatus({ pending = [], draining = false, lastError = null } = {}) {
  const status = document.getElementById("executionEvidenceStatus");
  const retry = document.getElementById("retryExecutionEvidenceBtn");
  if (status) status.textContent = lastError
    ? `Execution evidence needs retry (${pending.length} pending).`
    : draining || pending.length ? `Saving execution evidence (${pending.length} pending)…`
      : "Execution evidence saved.";
  status?.classList.toggle("sync-error", Boolean(lastError));
  retry?.classList.toggle("hidden", !lastError);
}

function getObservationQueue(practiceId) {
  const key = `${OBSERVATION_QUEUE_PREFIX}${practiceId}`;
  if (observationQueue && observationQueueKey === key) return observationQueue;
  observationQueueKey = key;
  let initial = [];
  try { initial = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
  const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
  observationQueue = createObservationQueue({
    initial: Array.isArray(initial) ? initial : [],
    persist: async observation => {
      if (!authReady) { await ensureSignedIn(); authReady = true; }
      await saveMemory({ operation: "execution-observation", practiceId, observation });
      localStorage.setItem(`${OBSERVATION_SYNC_PREFIX}${practiceId}`, String(Date.now()));
    },
    onChange: state => {
      localStorage.setItem(key, JSON.stringify(state.pending));
      renderObservationSyncStatus(state);
    }
  });
  observationQueue.retry();
  return observationQueue;
}

function nextObservationIdentity(practiceId) {
  const key = `${OBSERVATION_SEQUENCE_PREFIX}${practiceId}`;
  const next = Math.max(0, Number(localStorage.getItem(key) || 0)) + 1;
  localStorage.setItem(key, String(next));
  return String(next);
}

function recordExecutionObservation(action, state = getState(), options = {}) {
  const payload = getPayload();
  const session = getSessionPayload();
  const practiceId = String(payload.practiceId || session.practiceId || "").trim();
  const sessionId = String(payload.sessionId || session.sessionId || SESSION_PARAM || "").trim();
  const current = Array.isArray(state.playlist) ? state.playlist[state.index] : null;
  const block = executionBlockAt(state.index) || current;
  if (!practiceId || !sessionId || !block) return false;
  const elapsedSeconds = options.elapsedSeconds ?? getRunElapsedSeconds(state);
  const active = options.active ?? (executionBlockAt(state.index) ? getActiveInnerDrill(block, elapsedSeconds) : null);
  const identity = options.identity || nextObservationIdentity(practiceId);
  const observation = executionObservation({
    practiceId, sessionId, planVersion: Number(payload.planVersion || 1), action, block, active,
    elapsedSeconds,
    eventId: `${sessionId.slice(0, 40)}:${payload.planVersion || 1}:${String(block.id || block.slot || block.title).slice(0, 20)}:${String(identity).slice(0, 60)}:${action}`
  });
  return getObservationQueue(practiceId).enqueue(observation);
}

function recordCompletedMilestones(state, compiledBlock, elapsedSeconds) {
  if (!compiledBlock) return;
  completedExecutionMilestones(compiledBlock, elapsedSeconds, state.skippedMilestones).forEach(milestone => {
    const drillId = milestone.active?.drill?.id || "drill";
    const phaseId = milestone.active?.phase?.id || "all";
    recordExecutionObservation(milestone.action, state, {
      ...milestone,
      identity: `${drillId}:${phaseId}`
    });
  });
}

window.retryExecutionEvidence = function () { observationQueue?.retry(); };

ensureSignedIn()
  .then(() => {
    authReady = true;
    subscribeRemoteControl();
  })
  .catch(err => {
    console.warn("Big Clock auth warning:", err);
  });

const savedScale =
  Number(localStorage.getItem(TV_SCALE_KEY) || 1);

document.documentElement.style.setProperty(
  "--tv-scale",
  savedScale
);

/* =========================
   AUDIO
========================= */

function getAudioCtx() {
  try {
    const AudioContext =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return null;

    if (!audioCtx) {
      audioCtx = new AudioContext();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    return audioCtx;
  } catch (err) {
    console.warn("Audio context failed:", err);
    return null;
  }
}

function beep(frequency = 880, duration = 0.2) {
  const ctx = getAudioCtx();

  if (!ctx) return;

  try {
    const oscillator =
      ctx.createOscillator();

    const gain =
      ctx.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (err) {
    console.warn("Beep failed:", err);
  }
}

function intersectionBeep(index) {
  const key =
    `intersection-${index}`;

  if (lastBeepKey === key) return;

  lastBeepKey = key;

  beep(880, 0.16);
  setTimeout(() => beep(880, 0.16), 220);
  setTimeout(() => beep(880, 0.16), 440);
}

function completeBeep() {
  const key = "complete";

  if (lastBeepKey === key) return;

  lastBeepKey = key;

  beep(440, 0.8);
  setTimeout(() => beep(440, 0.8), 1000);
  setTimeout(() => beep(440, 0.8), 2000);
}

window.testBeep = function () {
  beep(880, 1);
};

window.testTransitionBeep = function () {
  intersectionBeep("test");
};

window.testCompleteBeep = function () {
  completeBeep();
};
/* =========================
   HELPERS
========================= */

function format(totalSeconds = 0) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function currentRunIdentity() {
  const query = new URLSearchParams(window.location.search);
  return practiceRunIdentity({
    queryPracticeId: query.get("practiceId"),
    querySessionId: query.get("session"),
    payload: getPayload(),
    session: getSessionPayload()
  });
}
function getState() {
  try {
    return restorePracticeRun(
      JSON.parse(localStorage.getItem(STATE_KEY) || "{}"),
      currentRunIdentity()
    );
  } catch {
    return {};
  }
}

async function setState(state) {
  const identity = currentRunIdentity();
  if (!identity.practiceId || !identity.sessionId) {
    throw new Error("Cannot save a Big Clock run without practice and session identity.");
  }
  const scopedState = { ...state, ...identity };
  localStorage.setItem(
    STATE_KEY,
    JSON.stringify(scopedState)
  );

  try {
    if (!authReady) return;

    const session =
      getSessionPayload();

    const sessionId =
      session.sessionId || SESSION_PARAM || "lompoc-mat-1";

    await setDoc(
      doc(db, "liveSessions", sessionId),
      {
        runState: {
          running: state.running || false,
          paused: state.paused || false,
          complete: state.complete || false,

          index: state.index || 0,

          blockStartedAt:
            state.blockStartedAt || null,

          blockDuration:
            state.blockDuration || 0,

          blockElapsedSeconds:
            state.blockElapsedSeconds || 0,

          updatedAt:
            serverTimestamp()
        }
      },
      { merge: true }
    );

    const payload = getPayload();
    const practiceId = String(payload.practiceId || session.practiceId || "").trim();
    if (practiceId) {
      const current = Array.isArray(state.playlist) ? state.playlist[state.index] : null;
      const compiled = executionBlockAt(state.index);
      const active = compiled ? getActiveInnerDrill(compiled, getRunElapsedSeconds(state)) : null;
      const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
      await saveMemory({ operation: "execution-state", practiceId, commandVersion: remoteControlVersion,
        state: controllerSnapshot(state, { sessionId, blockId: current?.slot || current?.title || "",
          drillId: state.activeDrillId || active?.drill?.id || "", groupId: state.activeGroupId || "" }) });
    }

  } catch (err) {
    console.warn(
      "runState sync failed:",
      err
    );
    const status = document.getElementById("remoteExecutionStatus");
    if (status && remoteControlVersion > 0) status.textContent = `Remote acknowledgment failed: ${err?.code || err?.message || "retrying"}`;
  }
}

// Recheck after an asynchronous handoff: auth may finish before the
// canonical practice identity reaches local storage.
function ensureRemoteControlListener() {
  if (authReady && !remoteControlPoll) subscribeRemoteControl();
}

function subscribeRemoteControl() {
  const payload = getPayload();
  const practiceId = String(payload.practiceId || getSessionPayload().practiceId || "").trim();
  if (!practiceId || remoteControlPoll) return;
  const poll = async () => {
    try {
    const getPractice = httpsCallable(functions, "getPracticeSession");
    const result = await getPractice({ practiceId });
    const control = result.data?.practice?.sessionMemory?.executionControl || {};
    const version = Number(control.version || 0);
    let current = getState();
    remoteControlVersion = version;
    if (!control.command || version <= Number(current.remoteCommandVersion || 0)) {
      // The command can be applied locally even when its remote acknowledgment failed.
      // Retry only the acknowledgment; never execute the same command a second time.
      if (version > 0 && Number(current.remoteCommandVersion || 0) === version
          && Number(control.appliedVersion || 0) < version) {
        await setState(current);
      }
      return;
    }
    if (control.command.type === "start" && !Array.isArray(current.playlist)) {
      startFromPayload();
      current = getState();
    }
    const compiled = executionBlockAt(current.index);
    const elapsed = getRunElapsedSeconds(current);
    const active = compiled ? getActiveInnerDrill(compiled, elapsed) : null;
    let next = applyExecutionCommand(current, control.command, {
      now: Date.now(), phaseEndSeconds: active?.phaseEndsAtSeconds || Number(current.blockDuration || 0),
      blockCount: Array.isArray(current.playlist) ? current.playlist.length : 0
    });
    if (["switch-drill", "substitute-drill"].includes(control.command.type)) {
      const targetBlockIndex = (current.playlist || []).findIndex(item =>
        String(item.slot || item.title || "") === String(control.command.blockId || ""));
      const targetIndex = targetBlockIndex >= 0 ? targetBlockIndex : Number(current.index || 0);
      const targetCompiled = executionBlockAt(targetIndex);
      const selectedId = control.command.replacementDrillId || control.command.drillId;
      let offset = 0;
      for (const drill of targetCompiled?.drills || []) {
        if (String(drill.id) === String(selectedId)) break;
        offset += Number(drill.seconds || 0);
      }
      const targetPlaylistBlock = current.playlist?.[targetIndex];
      next = { ...next, index: targetIndex, blockElapsedSeconds: offset, blockStartedAt: Date.now(),
        blockDuration: Number(targetPlaylistBlock?.minutes || 0) * 60 };
    }
    if (control.command.type === "advance") {
      const nextBlock = current.playlist?.[next.index];
      const blockId = String(nextBlock?.slot || nextBlock?.title || "");
      next.blockDuration = Number(next.remoteFutureAdjustments?.[blockId] || Number(nextBlock?.minutes || 0) * 60);
    }
    if (control.command.type === "skip" && active?.drill?.id) {
      const excluded = new Set(Array.isArray(current.skippedMilestones) ? current.skippedMilestones : []);
      if (active.phase?.id) excluded.add(`phase:${active.drill.id}:${active.phase.id}`);
      excluded.add(`drill:${active.drill.id}`);
      next = { ...next, skippedMilestones: [...excluded] };
      recordExecutionObservation("skip", current);
    }
    if (control.command.type === "advance") recordExecutionObservation("advance", current);
    if (control.command.type === "end") recordExecutionObservation("early-complete", current);
    next.remoteCommandVersion = version;
    await setState(next);
    const remoteStatus = document.getElementById("remoteExecutionStatus");
    if (remoteStatus) remoteStatus.textContent = "";
    render();
    } catch (error) {
      console.warn("Remote execution control unavailable:", error);
      const status = document.getElementById("remoteExecutionStatus");
      if (status) status.textContent = `Remote sync needs attention: ${error?.code || error?.message || "retrying"}`;
    }
    finally { if (remoteControlPoll) setTimeout(poll, 1000); }
  };
  remoteControlPoll = true;
  void poll();
}

function matLaneLabel() {
  return "Mat 1";
}

function renderLaneIdentity() {
  const session = getSessionPayload();
  const label = matLaneLabel(session);
  const readyLane = document.getElementById("clockMatLane");
  if (readyLane) readyLane.textContent = label;
  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = `Sandman Combat · ${label}`;
}

function getPayload() {
  try {
    return JSON.parse(localStorage.getItem(PAYLOAD_KEY) || "{}");
  } catch {
    return {};
  }
}

function getSessionPayload() {
  try {
    return JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
  } catch {
    return {};
  }
}

function enforcePracticeHandoff() {
  const query = new URLSearchParams(window.location.search);
  const payload = getPayload();
  const session = getSessionPayload();
  const practiceId = String(
    query.get("practiceId") ||
    payload.practiceId ||
    session.practiceId ||
    ""
  ).trim();
  const sessionId = String(
    query.get("session") ||
    payload.sessionId ||
    session.sessionId ||
    ""
  ).trim();

  if (!practiceId || !sessionId) {
    window.location.replace("/coaches/practice/?notice=clock-requires-practice");
    return false;
  }
  return true;
}

if (!enforcePracticeHandoff()) {
  throw new Error("Big Clock requires an active practice handoff.");
}


function isFastPass() {
  const payload = getPayload();
  return payload.source === "session-builder-fast-pass"
    || new URLSearchParams(window.location.search).get("fast") === "1";
}

function renderFastPassSetup() {
  const panel = document.getElementById("fastPassTimeSetup");
  if (!panel) return;
  panel.classList.toggle("hidden", !isFastPass());
  document.querySelectorAll("[data-fast-minutes]").forEach((button) => {
    const active = Number(button.dataset.fastMinutes || 0) === fastPassMinutes;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setFastPassMinutes(minutes) {
  const next = Number(minutes || 0);
  if (![30, 45, 60, 90].includes(next)) return;
  fastPassMinutes = next;
  const payload = getPayload();
  payload.durationMinutes = next;
  payload.blocks = [{
    title: "Practice",
    minutes: next,
    cards: [],
    notes: "",
    drillBlocks: []
  }];
  localStorage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
  renderFastPassSetup();
}

async function prepareFastPassPractice() {
  if (!isFastPass()) return;
  const payload = getPayload();
  const session = getSessionPayload();
  const practiceId = String(payload.practiceId || session.practiceId || "").trim();
  if (!practiceId) throw new Error("Fast practice is missing its practice ID.");
  if (!authReady) {
    await ensureSignedIn();
    authReady = true;
  }

  const openPractice = httpsCallable(functions, "openPracticeSession");
  await openPractice({
    practiceId,
    liveSessionId: session.sessionId,
    locationId: session.locationId,
    academyId: session.locationId,
    roomId: session.roomId,
    discipline: session.discipline || "unassigned",
    journey: session.journey || "",
    program: session.program || "",
    track: session.track || "",
    tier: session.tier || "",
    schema: "fast-practice",
    executionMode: session.executionMode || "manual",
    durationMinutes: fastPassMinutes,
    week: session.week || ""
  });

  const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
  const getPractice = httpsCallable(functions, "getPracticeSession");
  const canonical = await getPractice({ practiceId });
  const planVersion = resolveNextPlanVersion(canonical.data?.practice?.sessionMemory?.planVersion);
  await saveMemory({
    operation: "plan",
    practiceId,
    planVersion,
    plannedBlocks: [{
      blockId: "Practice",
      title: "Practice",
      minutes: fastPassMinutes,
      cards: []
    }],
    plannedCards: []
  });

  payload.planVersion = planVersion;
  localStorage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
  const nextSession = { ...session, planVersion, durationMinutes: fastPassMinutes, schema: "fast-practice" };
  localStorage.setItem("sandman_session_builder_v1", JSON.stringify(nextSession));
}

function configureEndAction() {
  const action = document.getElementById("sessionEndPrimaryAction");
  if (!action || !isFastPass()) return;
  const payload = getPayload();
  const session = getSessionPayload();
  const practiceId = String(payload.practiceId || session.practiceId || "").trim();
  action.textContent = "Post Practice Input";
  action.href = practiceId
    ? `/coaches/logs/practice-log.html?practiceId=${encodeURIComponent(practiceId)}&fast=1`
    : "/coaches/logs/practice-log.html";
}

document.querySelectorAll("[data-fast-minutes]").forEach((button) => {
  button.addEventListener("click", () => setFastPassMinutes(button.dataset.fastMinutes));
});

function startFromPayload() {
  lastBeepKey = "";

  const payload = getPayload();

  const blocks = Array.isArray(payload.blocks)
    ? payload.blocks
    : [];

  if (!blocks.length) return;
  subscribeRemoteControl();



const playlist = blocks
  .map(b => ({
    slot: b.slot || "",
    title: b.title || b.slot || "Block",
    minutes: Number(b.minutes || 0),
    cards: Array.isArray(b.cards) ? b.cards : [],
    notes: b.notes || "",
    timer: b.timer || null,
    drillBlocks: Array.isArray(b.drillBlocks) ? b.drillBlocks : [],
    groupActivities: Array.isArray(b.groupActivities) ? b.groupActivities : []
  }))
    .filter(b => b.minutes > 0);

  if (!playlist.length) return;

  updateDurableWorkedMemory({ started: true }).catch(error => {
    console.warn("Execution start memory sync failed:", error);
  });

  setState({
    running: true,
    paused: false,
    complete: false,
    index: 0,
    playlist,
    blockStartedAt: Date.now(),
    blockDuration: playlist[0].minutes * 60,
    blockElapsedSeconds: 0,
    updatedAt: Date.now()
  });
  recordExecutionObservation("start");
}

function renderComplete({
  statusEl,
  blockEl,
  clockEl,
  nextEl,
  cuesEl
}) {
  if (statusEl) {
    statusEl.textContent = "COMPLETE";
    statusEl.className = "status complete";
  }

  if (blockEl) {
    blockEl.innerHTML = `
      <span class="sandman-title">SANDMAN COMBAT</span>
      <span class="sandman-tag">Built In The Shadows</span>
    `;
  }

  if (cuesEl) {
    cuesEl.innerHTML = "";
  }

  document.getElementById("drillPanel")?.classList.add("hidden");

  if (clockEl) {
    clockEl.textContent = "00:00";
  }

  if (nextEl) {
    nextEl.textContent = "Practice Complete";
  }

  document
    .getElementById("sessionEndActions")
    ?.classList.remove("hidden");
}

function getActiveDrill(current, elapsedSeconds = 0) {
  const drills = Array.isArray(current?.drillBlocks)
    ? current.drillBlocks.filter(drill => Number(drill?.minutes || 0) > 0)
    : [];

  if (!drills.length) return { current: null, next: null, remaining: 0 };

  let cursor = 0;
  for (let i = 0; i < drills.length; i += 1) {
    const drill = drills[i];
    const duration = Math.max(0, Number(drill.minutes || 0) * 60);
    const end = cursor + duration;

    if (elapsedSeconds < end || i === drills.length - 1) {
      return {
        current: drill,
        next: drills[i + 1] || null,
        remaining: Math.max(0, end - elapsedSeconds)
      };
    }

    cursor = end;
  }

  return { current: null, next: null, remaining: 0 };
}

function phaseDisplayName(phase) {
  if (!phase) return "";
  if (phase.rotation) return "Rotation";
  if (phase.kind === "rest") return "Rest";
  if (phase.kind === "break" && /between matches|recovery/i.test(phase.label)) return "Recovery";
  if (phase.kind === "break") return "Break";
  return "Work";
}

function groupAssignmentLabel(groupIds = []) {
  if (!groupIds.length) return "";
  const groups = Array.isArray(getPayload().trainingGroups) ? getPayload().trainingGroups : [];
  return groupIds.map(groupId => groups.find(group => String(group.id) === String(groupId))?.label || groupId).join(" · ");
}

function executionBlockAt(index) {
  const plan = getPayload().executionContract;
  return plan?.valid === false ? null
    : Array.isArray(plan?.blocks) ? plan.blocks[Number(index || 0)] : null;
}

function renderDrillPanel(current, elapsedSeconds) {
  const panel = document.getElementById("drillPanel");
  const labelEl = document.getElementById("drillLabel");
  const nameEl = document.getElementById("drillName");
  const goalEl = document.getElementById("drillGoal");
  const levelEl = document.getElementById("drillCueLevel");
  const flowEl = document.getElementById("drillFlow");
  const contextEl = document.getElementById("drillContext");

  if (!panel || !labelEl || !nameEl || !goalEl || !levelEl || !flowEl) return;

  const compiledBlock = executionBlockAt(getState().index);
  const adapted = compiledBlock ? getActiveInnerDrill(compiledBlock, elapsedSeconds) : null;
  const legacy = adapted ? null : getActiveDrill(current, elapsedSeconds);
  const active = adapted || (legacy?.current ? {
    drill: legacy.current, next: legacy.next, phase: null,
    phaseRemainingSeconds: legacy.remaining
  } : null);
  const drill = active?.drill;

  if (!drill) {
    panel.classList.add("hidden");
    nameEl.textContent = "";
    goalEl.textContent = "";
    levelEl.textContent = "";
    flowEl.textContent = "";
    if (contextEl) contextEl.textContent = "";
    return;
  }

  panel.classList.remove("hidden");
  const phaseName = phaseDisplayName(active.phase);
  const round = active.phase?.round > 0 && active.phase?.rounds > 0
    ? ` · Round ${active.phase.round}/${active.phase.rounds}` : "";
  const shortTime = active.shortTimeActive ? " · SHORT TIME" : "";
  labelEl.textContent = phaseName
    ? `${phaseName}${round} · ${format(active.phaseRemainingSeconds)}${shortTime}`
    : "Current drill";
  nameEl.textContent = drill.name || "Drill";
  levelEl.textContent = String(drill.cueLevel || "optimal").toUpperCase();
  goalEl.textContent = drill.goal ? `Goal: ${drill.goal}` : "";
  if (contextEl) {
    const groupLabel = groupAssignmentLabel(drill.assignedGroupIds);
    const rotation = active.phase?.rotation?.detail || active.phase?.rotation?.label || "";
    contextEl.textContent = [groupLabel, rotation].filter(Boolean).join(" · ");
  }

  const flow = String(drill.flowCues || "").trim();
  const coaching = String(drill.coachingCues || "").trim();
  const details = [coaching, flow].filter(Boolean).join("  •  ");
  flowEl.textContent = details;

  if (active.next) {
    const nextEl = document.getElementById("next");
    if (nextEl) {
      nextEl.textContent = `Next drill: ${active.next.name || "Drill"} • ${format(active.next.seconds || Number(active.next.minutes || 0) * 60)}`;
    }
  }
}

function render() {
  const data = getState();
  const liveTools = document.getElementById("liveCompanionTools");
  const liveVisible = Boolean(data.running || data.paused) && !data.complete;
  liveTools?.classList.toggle("hidden", !liveVisible);
  document.getElementById("practiceControls")?.classList.toggle("hidden", !liveVisible);
  if (!liveVisible) {
    document.getElementById("liveCompanionPanel")?.classList.add("hidden");
    document.getElementById("liveCompanionToggle")?.setAttribute("aria-expanded", "false");
  }
  // Never show the ready overlay over a running, paused, or completed session.
  const ready = document.getElementById("readyScreen");
  if (ready) {
    ready.classList.toggle("hidden", Boolean(data.running || data.paused || data.complete));
  }

  const statusEl = document.getElementById("status");
  const blockEl = document.getElementById("block");
  const clockEl = document.getElementById("clock");
  const nextEl = document.getElementById("next");
  const actionEl = document.getElementById("action");
  const cuesEl = document.getElementById("cues");
  const pauseButton = document.getElementById("pausePracticeBtn");
  if (pauseButton) pauseButton.textContent = data.paused ? "Resume" : "Pause";

  if (data.complete) {
    renderComplete({
      statusEl,
      blockEl,
      clockEl,
      nextEl,
      cuesEl
    });

    return;
  }

  // Optional v1 execution contract. Older sessions keep their existing display.
  const compiledBlock = executionBlockAt(data.index);
  const playlist = Array.isArray(data.playlist)
    ? data.playlist
    : [];

  const current =
    playlist[data.index] || null;

  const next =
    playlist[(data.index || 0) + 1] || null;

  const status =
    data.paused
      ? "paused"
      : data.running
      ? "running"
      : "stopped";

  if (statusEl) {
    statusEl.textContent = status.toUpperCase();
    statusEl.className = `status ${status}`;
  }

if (blockEl) {
  blockEl.textContent =
    current?.title || "No active block";
}

if (actionEl) {
  const timerLabel =
    current?.timer?.label || "";

  const elapsedForInterval = getRunElapsedSeconds(data);
  const activeInner = compiledBlock?.id === (current?.slot || current?.title)
    ? getActiveInnerDrill(compiledBlock, elapsedForInterval) : null;
  const activeInterval = compiledBlock?.id === (current?.slot || current?.title)
    ? getActiveCombatInterval(compiledBlock, elapsedForInterval) : null;
  actionEl.textContent = activeInner?.phase
    ? `${activeInner.phase.label} · ${phaseDisplayName(activeInner.phase)} · ${format(activeInner.phaseRemainingSeconds)}`
    : activeInterval && activeInterval.phase !== "complete"
    ? `${activeInterval.label} · ${activeInterval.phase === "rest" ? "Rest" : "Work"} · Round ${activeInterval.round}/${activeInterval.rounds} · ${format(activeInterval.remainingSeconds)}`
    : timerLabel || "";
}

  const elapsed = getRunElapsedSeconds(data);
  recordCompletedMilestones(data, compiledBlock, elapsed);

  const remaining =
    Math.max(
      0,
      (data.blockDuration || 0) - elapsed
    );

  if (clockEl) {
    clockEl.textContent =
      format(remaining);
  }

  renderDrillPanel(current, elapsed);

  if (remaining <= 0 && data.running) {
    const nextIndex =
      Number(data.index || 0) + 1;

    const nextBlock =
      playlist[nextIndex];

    if (nextBlock) {
      intersectionBeep(nextIndex);

      updateDurableWorkedMemory({ block: current }).catch(error => {
        console.warn("Worked block memory sync failed:", error);
      });
      recordExecutionObservation("advance", data);

      setState({
        ...data,
        index: nextIndex,
        blockStartedAt: Date.now(),
        blockDuration: Number(data.remoteFutureAdjustments?.[String(nextBlock.slot || nextBlock.title || "")]
          || Number(nextBlock.minutes || 0) * 60),
        blockElapsedSeconds: 0,
        updatedAt: Date.now()
      });
    } else {
      completeBeep();

      updateDurableWorkedMemory({ block: current, completed: true }).catch(error => {
        console.warn("Execution completion memory sync failed:", error);
      });
      recordExecutionObservation("complete", data);

      setState({
        ...data,
        running: false,
        paused: false,
        complete: true,
        updatedAt: Date.now()
      });
    }

    return;
  }

  const cues =
    Array.isArray(current?.cards)
      ? current.cards
      : [];

  if (cuesEl) {
    cuesEl.innerHTML = cues.length
      ? cues
          .map(c => {
            const label =
              typeof c === "string"
                ? c
                : c.title || "";

            return `
              <div class="cue-item">
                ${label}
              </div>
            `;
          })
          .join("")
      : "";
  }

  if (nextEl) {
    const hasDrills = Array.isArray(current?.drillBlocks) && current.drillBlocks.some(drill => Number(drill?.minutes || 0) > 0);

    if (!hasDrills) {
      nextEl.textContent = next
        ? `Next: ${next.title} • ${String(next.minutes).padStart(2, "0")}:00`
        : "Next: —";
    }
  }
}

window.togglePracticePause = function () {
  const state = getState();
  if (state.complete || (!state.running && !state.paused)) return;
  recordExecutionObservation(state.paused ? "resume" : "pause", state);
  setState(state.paused ? resumeRunClock(state) : pauseRunClock(state));
  render();
};

window.skipPracticePhase = function () {
  const state = getState();
  if (state.complete || (!state.running && !state.paused)) return;
  const current = Array.isArray(state.playlist) ? state.playlist[state.index] : null;
  if (!current) return;
  const compiledBlock = executionBlockAt(state.index);
  const elapsed = getRunElapsedSeconds(state);
  const active = compiledBlock ? getActiveInnerDrill(compiledBlock, elapsed) : null;
  recordExecutionObservation("skip", state);
  if (active?.phaseEndsAtSeconds > elapsed) {
    const excluded = new Set(Array.isArray(state.skippedMilestones) ? state.skippedMilestones : []);
    if (active.drill?.id && active.phase?.id) excluded.add(`phase:${active.drill.id}:${active.phase.id}`);
    if (active.drill?.id) excluded.add(`drill:${active.drill.id}`);
    setState({ ...seekRunClock(state, active.phaseEndsAtSeconds), skippedMilestones: [...excluded] });
    render();
    return;
  }
  setState(seekRunClock(state, Number(state.blockDuration || 0)));
  render();
};

window.completePracticeNow = function () {
  const state = getState();
  if (state.complete || (!state.running && !state.paused)) return;
  if (!window.confirm("Complete this practice now?")) return;
  const current = Array.isArray(state.playlist) ? state.playlist[state.index] : null;
  completeBeep();
  updateDurableWorkedMemory({ block: current, completed: true }).catch(error => {
    console.warn("Execution completion memory sync failed:", error);
  });
  recordExecutionObservation("early-complete", state);
  setState({ ...state, running: false, paused: false, complete: true,
    blockElapsedSeconds: getRunElapsedSeconds(state), updatedAt: Date.now() });
  render();
};

const readyScreen =
  document.getElementById("readyScreen");

/* =========================
   READY SCREEN LAUNCH
========================= */

window.startPracticeNow = async function () {
  const startButton = document.querySelector(".ready-start");
  if (startButton) startButton.disabled = true;
  try {
    await prepareFastPassPractice();
    beep(660, 0.12);

    document
      .getElementById("sessionEndActions")
      ?.classList.add("hidden");

    startFromPayload();
    readyScreen?.classList.add("hidden");
  } catch (error) {
    console.error("Practice start failed:", error);
    const status = document.querySelector(".ready-status");
    if (status) status.textContent = error?.message || "Could not start practice.";
  } finally {
    if (startButton) startButton.disabled = false;
  }
};

window.toggleLiveCompanionQr = function () {
  const panel = document.getElementById("liveCompanionPanel");
  const button = document.getElementById("liveCompanionToggle");
  const image = document.getElementById("liveCompanionQr");
  if (!panel || !button || !image) return;
  const opening = panel.classList.contains("hidden");
  if (opening) {
    const session = getSessionPayload();
    const sessionId = session.sessionId || SESSION_PARAM || "lompoc-mat-1";
    const practiceId = String(getPayload().practiceId || session.practiceId || "").trim();
    const url = `${window.location.origin}/coaches/execution/coach-companion/?session=${encodeURIComponent(sessionId)}${practiceId ? `&practiceId=${encodeURIComponent(practiceId)}` : ""}`;
    if (image.dataset.url !== url) {
      image.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
      image.dataset.url = url;
    }
  }
  panel.classList.toggle("hidden", !opening);
  button.setAttribute("aria-expanded", String(opening));
};

window.showBigClockQr = function () {
  const session = getSessionPayload();
  const sessionId = session.sessionId || SESSION_PARAM || "lompoc-mat-1";

  const url =
    `${window.location.origin}/coaches/execution/big-clock-2.0/?session=${encodeURIComponent(sessionId)}`;

  showQrPanel(url, "Scan To Open Big Clock");
};

window.showCompanionQr = function () {
  const session = getSessionPayload();
  const sessionId = session.sessionId || SESSION_PARAM || "lompoc-mat-1";

  const url =
    `${window.location.origin}/coaches/execution/coach-companion/?session=${encodeURIComponent(sessionId)}`;

  showQrPanel(url, "Scan To Open Coach Companion");
};

function showQrPanel(url, title = "Scan QR") {
  const qrPanel =
    document.getElementById("qrPanel");

  const qrImage =
    document.getElementById("qrImage");

  const qrTitle =
    document.getElementById("qrTitle");

  const alreadyOpen =
    qrPanel?.classList.contains("active");

  const currentSrc =
    qrImage?.dataset.url || "";

  if (alreadyOpen && currentSrc === url) {
    qrPanel.classList.remove("active");
    qrPanel.classList.add("hidden");

    qrImage.removeAttribute("src");
    qrImage.dataset.url = "";

    return;
  }

  if (qrTitle) {
    qrTitle.textContent = title;
  }

  if (qrImage) {
    qrImage.src =
      `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;

    qrImage.dataset.url = url;
  }

  qrPanel?.classList.remove("hidden");
  qrPanel?.classList.add("active");
}

renderLaneIdentity();
render();

setInterval(render, 250);
setInterval(ensureRemoteControlListener, 1000);

window.addEventListener("storage", e => {
  if (e.key === STATE_KEY) {
    render();
  }
});
