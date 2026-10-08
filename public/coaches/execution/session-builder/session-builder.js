import {
  LADDER_YOUTH,
  LADDER_F4,
  LADDER_Q2M
} from "/assets/js/ladder.service.js";
import {
  db,
  doc,
  functions,
  getDoc,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";
import {
  SESSION_PROGRAMS,
  SESSION_ROOMS,
  attendanceParticipants,
  attendanceRankSummary,
  normalizeExecutionMode,
  programById,
  programsForLocation,
  roomByValue
} from "/coaches/execution/session-builder/session-entry-policy.js";

const SESSION_KEY = "sandman_session_builder_v1";
const CLIPBOARD_KEY = "sandman_clipboard_v1";
const DRAFT_KEY = "sandman_clipboard_draft_v1";
const BIG_CLOCK_PAYLOAD_KEY = "sandman_big_clock_payload_v2";

const SESSION_TYPES = Object.freeze({
  academy: { label: "Academy Class", durations: [60, 75, 90, 120], defaultMinutes: 60 },
  private: { label: "Private Session", durations: [30, 45, 60, 90], defaultMinutes: 45 }
});

const RANK_LADDERS = Object.freeze({
  Z2H: LADDER_YOUTH,
  P2L: LADDER_F4,
  Q2M: LADDER_Q2M
});

const sessionTypeButtons = [...document.querySelectorAll("[data-session-type]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const durationChoices = document.getElementById("durationChoices");
const disciplineFamilySelect = document.getElementById("disciplineFamilySelect");
const programField = document.getElementById("programField");
const roomSelect = document.getElementById("roomSelect");
const disciplineSelect = document.getElementById("disciplineSelect");
const rankSelect = document.getElementById("rankSelect");
const weekSelect = document.getElementById("weekSelect");
const rankField = document.getElementById("rankField");
const weekField = document.getElementById("weekField");
const modeField = document.getElementById("modeField");
const buildBtn = document.getElementById("buildBtn");
const modeAvailability = document.getElementById("modeAvailability");
const summaryAvailability = document.getElementById("summaryAvailability");
const prePracticeGate = document.getElementById("prePracticeGate");
const currentSessionSection = document.getElementById("currentSessionSection");
const newSessionSection = document.getElementById("newSessionSection");
const setupPrePracticeBtn = document.getElementById("setupPrePracticeBtn");
const skipCleanSlateBtn = document.getElementById("skipCleanSlateBtn");

let selectedSessionType = "academy";
let selectedDuration = 60;
let selectedSchema = "academy-60";
let selectedMode = "hybrid";
let hybridModel = null;
let hybridUsable = false;
let availabilityRequest = 0;
let modeWasForced = false;
let activePracticeId = "";

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getRecoverableDraft() {
  const draft = readJson(DRAFT_KEY, null);
  if (!draft || draft.version !== 1) return null;
  return ["editing", "launched"].includes(draft.lifecycle) ? draft : null;
}

function optionText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

function selectedProgramOption() {
  return disciplineSelect?.selectedOptions?.[0] || null;
}

function selectedRoom() {
  return roomByValue(roomSelect?.value || "");
}

function selectedProgram() {
  return programById(disciplineSelect?.value || "");
}

function populateRooms(preferredValue = "") {
  const rememberedRoom = readJson(SESSION_KEY, {})?.roomValue || "";
  const preferred = preferredValue || rememberedRoom;
  roomSelect.innerHTML = "";
  SESSION_ROOMS.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.value;
    option.textContent = room.label;
    roomSelect.appendChild(option);
  });
  if (roomByValue(preferred)) roomSelect.value = preferred;
}

function populatePrograms(preferredProgramId = "") {
  const room = selectedRoom();
  const discipline = String(disciplineFamilySelect?.value || "").trim();
  const programs = programsForLocation(room?.locationId || "")
    .filter((program) => program.programId !== "manual-build")
    .filter((program) => !discipline || program.discipline === discipline);

  disciplineSelect.innerHTML = discipline
    ? '<option value="">No specific program</option>'
    : '<option value="">Select Discipline First</option>';

  programs.forEach((program) => {
    const option = document.createElement("option");
    option.value = program.programId;
    option.textContent = program.label;
    disciplineSelect.appendChild(option);
  });

  if (programs.some((program) => program.programId === preferredProgramId)) {
    disciplineSelect.value = preferredProgramId;
  }

  if (programField) programField.hidden = !discipline;
}

function programUsesRank() {
  return Boolean(selectedProgram()?.journey && RANK_LADDERS[selectedProgram().journey]);
}

function programUsesWeek() {
  return programUsesRank() && selectedMode !== "auto";
}

function isManualOnlyProgram() {
  return false;
}

function tierFromLadderKey(key = "") {
  return String(key).replace(/^R/i, "T");
}

function populateRanks(preferredTier = "") {
  const journey = selectedProgram()?.journey || "";
  const ladder = RANK_LADDERS[journey] || [];
  rankSelect.innerHTML = "";

  if (!ladder.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Not needed";
    rankSelect.appendChild(option);
    return;
  }

  ladder.forEach(rank => {
    const option = document.createElement("option");
    option.value = tierFromLadderKey(rank.key);
    option.textContent = `${option.value} — ${rank.name}`;
    rankSelect.appendChild(option);
  });

  if (preferredTier && [...rankSelect.options].some(option => option.value === preferredTier)) {
    rankSelect.value = preferredTier;
  }
}

function populateWeeks() {
  weekSelect.innerHTML = '<option value="">Select Week</option>';
  for (let week = 1; week <= 36; week += 1) {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    weekSelect.appendChild(option);
  }
}

function getModelPath() {
  const prefix = selectedProgram()?.hybridModelPrefix || "";
  const tier = String(rankSelect?.value || "").toLowerCase();
  return prefix && tier ? `${prefix}-${tier}-waves.js` : "";
}

function modelHasConsumableCards(model) {
  return Object.values(model?.WAVE_CARDS || {}).some(cards => Array.isArray(cards) && cards.length > 0);
}

async function refreshHybridAvailability() {
  const requestId = ++availabilityRequest;
  hybridModel = null;
  hybridUsable = false;

  if (!programUsesRank()) {
    updateModeButtons();
    updateConditionalControls();
    updateSummary();
    return;
  }

  const path = getModelPath();
  if (path) {
    try {
      const model = await import(path);
      if (requestId !== availabilityRequest) return;
      hybridModel = model;
      hybridUsable = modelHasConsumableCards(model);
    } catch (error) {
      if (requestId !== availabilityRequest) return;
      console.warn("Guided model unavailable:", path, error);
    }
  }

  updateModeButtons();
  updateConditionalControls();
  updateSummary();
}

function updateModeButtons() {
  modeButtons.forEach(button => {
    const active = button.dataset.mode === selectedMode;
    button.disabled = false;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateConditionalControls() {
  const usesRank = programUsesRank();
  rankField.hidden = !usesRank || selectedMode === "auto";
  weekField.hidden = !programUsesWeek();
  modeAvailability.hidden = false;

  if (selectedMode === "auto") {
    modeAvailability.textContent = hybridUsable
      ? "Auto will use Sandman curriculum logic and the selected session context."
      : "Auto will use Sandman’s basic session logic for this context.";
    modeAvailability.classList.remove("unavailable");
  } else if (selectedMode === "hybrid") {
    modeAvailability.textContent = hybridUsable
      ? "Hybrid curriculum suggestions are available."
      : "Hybrid is active. Sandman will assist with the available session context.";
    modeAvailability.classList.remove("unavailable");
  } else {
    modeAvailability.textContent = "Manual keeps the detailed controls with Coach.";
    modeAvailability.classList.remove("unavailable");
  }
}

function shellData() {
  const type = SESSION_TYPES[selectedSessionType] || SESSION_TYPES.academy;
  return { label: type.label, minutes: selectedDuration };
}

function getProgramData() {
  const program = selectedProgram();
  const discipline = program?.discipline || String(disciplineFamilySelect?.value || "").trim();
  const tier = programUsesRank() && selectedMode !== "auto" ? rankSelect.value : "";
  const journey = program?.journey || "";
  const ladder = RANK_LADDERS[journey] || [];
  const rankName = ladder.find(rank => tierFromLadderKey(rank.key) === tier)?.name || "";

  return {
    program: program?.programId || "",
    foundry: program?.foundry || "",
    track: program?.track || "",
    journey,
    discipline,
    tier,
    rankLabel: rankName
  };
}

function updateSummary() {
  const shell = shellData();
  const program = getProgramData();
  const room = optionText(roomSelect) || "Choose a room";
  const usesRank = programUsesRank() && selectedMode !== "auto";
  const usesWeek = programUsesWeek();

  document.getElementById("currentRoomLabel").textContent = room;
  document.getElementById("summaryShell").textContent = `${shell.label} · ${shell.minutes} min`;
  document.getElementById("summaryRoom").textContent = room;
  document.getElementById("summaryDiscipline").textContent =
    disciplineFamilySelect?.selectedOptions?.[0]?.textContent?.trim() || "Select a discipline";
  document.getElementById("summaryProgramRow").hidden = !program.program;
  document.getElementById("summaryProgram").textContent = optionText(disciplineSelect) || "—";
  document.getElementById("summaryRankRow").hidden = !usesRank;
  document.getElementById("summaryRank").textContent = usesRank ? (optionText(rankSelect) || "Select a rank") : "—";
  document.getElementById("summaryWeekRow").hidden = !usesWeek;
  document.getElementById("summaryWeek").textContent = usesWeek ? (optionText(weekSelect) || "Select a week") : "—";
  const modeLabels = { auto: "Auto", hybrid: "Hybrid", manual: "Manual" };
  document.getElementById("summaryMode").textContent = modeLabels[selectedMode] || "Hybrid";

  if (!program.discipline) {
    summaryAvailability.textContent = "Choose a discipline to continue.";
  } else if (selectedMode === "auto") {
    summaryAvailability.textContent = hybridUsable
      ? "Sandman will build from the curriculum context."
      : "Sandman will build a basic guided session.";
  } else if (selectedMode === "hybrid") {
    summaryAvailability.textContent = hybridUsable
      ? "Sandman suggestions will be available in Clipboard."
      : "Hybrid assistance will use the session details you provide.";
  } else {
    summaryAvailability.textContent = "Coach-built session with all available detail controls.";
  }

  buildBtn.disabled = !program.discipline || !selectedRoom();
  buildBtn.textContent = selectedMode === "auto"
    ? "Build Auto Session"
    : selectedMode === "hybrid"
      ? "Continue with Hybrid"
      : "Build Manual Session";
}


function showPrePracticeSetup() {
  if (prePracticeGate) prePracticeGate.hidden = true;
  if (currentSessionSection) currentSessionSection.hidden = false;
  if (newSessionSection) newSessionSection.hidden = false;
  updateSummary();
}

function cleanSlatePayload() {
  const room = selectedRoom();
  if (!room) return null;
  return {
    schema: "fast-practice",
    durationMinutes: 60,
    xpTimeScale: "standard",
    executionMode: "manual",
    practiceId: "",
    sessionId: room.value,
    locationId: room.locationId,
    academyId: room.locationId,
    roomId: room.roomId,
    roomValue: room.value,
    program: "",
    foundry: "",
    track: "",
    journey: "",
    discipline: "unassigned",
    tier: "",
    rank: "",
    rankLabel: "",
    week: "",
    hybridPhase: "",
    hybridCycle: "",
    hybridWeekInCycle: "",
    hybridWaveKey: "",
    hybridWave: [],
    hybridCards: [],
    hybridRules: {},
    source: "session-builder-clean-slate",
    createdAt: new Date().toISOString()
  };
}

async function skipToPractice() {
  const existingDraft = getRecoverableDraft();
  if (existingDraft && !window.confirm("Skip setup and leave the unfinished Clipboard draft?")) return;
  let payload = cleanSlatePayload();
  if (!payload) {
    const noticeEl = document.getElementById("dashboardNotice");
    noticeEl.textContent = "Choose a valid room before starting practice.";
    noticeEl.hidden = false;
    return;
  }

  selectedMode = "manual";
  skipCleanSlateBtn.disabled = true;

  try {
    payload = await openCanonicalPractice(payload);
    payload.source = "session-builder-fast-pass";
    persistSession(payload);
    localStorage.setItem(BIG_CLOCK_PAYLOAD_KEY, JSON.stringify({
      source: "session-builder-fast-pass",
      practiceId: payload.practiceId,
      sessionId: payload.sessionId,
      durationMinutes: 60,
      blocks: [{
        title: "Practice",
        minutes: 60,
        cards: [],
        notes: "",
        drillBlocks: []
      }]
    }));
    window.location.href = `/coaches/execution/big-clock-2.0/?practiceId=${encodeURIComponent(payload.practiceId)}&fast=1`;
  } catch (error) {
    console.error("Skip-to-practice entry failed", error);
    const noticeEl = document.getElementById("dashboardNotice");
    noticeEl.textContent = error?.message || "Could not start practice.";
    noticeEl.hidden = false;
    skipCleanSlateBtn.disabled = false;
  }
}

function formatUpdated(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "Update time unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  return `Updated ${new Date(timestamp).toLocaleDateString()}`;
}

function renderDraft() {
  const draft = getRecoverableDraft();
  const card = document.getElementById("draftCard");
  const empty = document.getElementById("draftEmpty");
  card.hidden = !draft;
  empty.hidden = Boolean(draft);
  if (!draft) return;

  const session = draft.session || {};
  const draftSchema = String(draft.schema || session.schema || "");
  const draftType = draftSchema.startsWith("private-") ? "private" : "academy";
  const typeConfig = SESSION_TYPES[draftType] || SESSION_TYPES.academy;
  const shell = {
    label: typeConfig.label,
    minutes: Number(draft.durationMinutes || session.durationMinutes || draftSchema.split("-").pop() || 0)
  };
  const blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
  const cards = Array.isArray(draft.cards) ? draft.cards : [];
  const noteCount = blocks.filter(block => String(block.notes || "").trim()).length + (String(draft.focus || "").trim() ? 1 : 0);
  const allocated = blocks.filter(block => block.visible !== false).reduce((sum, block) => sum + Number(block.minutes || 0), 0);
  const modeLabel = session.executionMode === "auto" ? "Auto" : session.executionMode === "hybrid" ? "Hybrid" : "Manual";
  const identity = [session.discipline, session.tier && session.rankLabel ? `${session.tier} ${session.rankLabel}` : session.tier, session.week ? `Week ${session.week}` : "", modeLabel].filter(Boolean).join(" · ");

  document.getElementById("draftLifecycle").textContent = draft.lifecycle === "launched" ? "Sent to Clock" : "Editing";
  document.getElementById("draftTitle").textContent = `${shell.label} · ${shell.minutes || session.durationMinutes || 0} min · ${session.sessionId || "Room"}`;
  document.getElementById("draftUpdated").textContent = formatUpdated(draft.updatedAt);
  document.getElementById("draftIdentity").textContent = identity || "Manual coach-built session";
  document.getElementById("draftMetrics").textContent = `${cards.length} cards · ${noteCount} notes · ${allocated}/${shell.minutes || session.durationMinutes || allocated} min allocated`;
  document.getElementById("continueDraftBtn").href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(session.sessionId || "lompoc-mat-1")}`;
}

function getHybridData(weekValue) {
  if (!["hybrid", "auto"].includes(selectedMode) || !hybridUsable || !hybridModel) {
    return { hybridPhase: "", hybridCycle: "", hybridWeekInCycle: "", hybridWaveKey: "", hybridWave: [], hybridCards: [], hybridRules: {} };
  }

  const weekNumber = Math.max(1, Number(weekValue || 1));
  const structure = hybridModel.WEEK_STRUCTURE || ["teach", "drill", "live"];
  const phase = structure[(weekNumber - 1) % structure.length] || "teach";
  const cycle = Math.ceil(weekNumber / 6);
  const waveKeys = Object.keys(hybridModel.SKILL_WAVES || {});
  const waveKey = waveKeys[(cycle - 1) % waveKeys.length] || "";
  return {
    hybridPhase: phase,
    hybridCycle: cycle,
    hybridWeekInCycle: ((weekNumber - 1) % 6) + 1,
    hybridWaveKey: waveKey,
    hybridWave: hybridModel.SKILL_WAVES?.[waveKey] || [],
    hybridCards: hybridModel.WAVE_CARDS?.[waveKey] || [],
    hybridRules: hybridModel.HYBRID_RULES || {}
  };
}

function writeCompatibilityKeys(payload) {
  const entries = {
    sandman_clipboard_schema: payload.schema,
    sandman_session_duration_minutes: payload.durationMinutes,
    sandman_xp_time_scale: payload.xpTimeScale,
    sandman_execution_mode: payload.executionMode,
    sandman_live_session_id: payload.sessionId,
    sandman_location_id: payload.locationId,
    sandman_program: payload.program,
    sandman_foundry: payload.foundry,
    sandman_track: payload.track,
    sandman_journey: payload.journey,
    sandman_discipline: payload.discipline,
    sandman_tier: payload.tier,
    sandman_rank: payload.rank,
    sandman_rank_label: payload.rankLabel,
    sandman_week: payload.week,
    sandman_hybrid_phase: payload.hybridPhase,
    sandman_hybrid_cycle: payload.hybridCycle,
    sandman_hybrid_week_in_cycle: payload.hybridWeekInCycle,
    sandman_hybrid_wave_key: payload.hybridWaveKey,
    sandman_hybrid_wave: JSON.stringify(payload.hybridWave || []),
    sandman_hybrid_cards: JSON.stringify(payload.hybridCards || [])
  };
  Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, String(value ?? "")));
}

function renderDurationChoices() {
  const type = SESSION_TYPES[selectedSessionType] || SESSION_TYPES.academy;
  if (!type.durations.includes(selectedDuration)) selectedDuration = type.defaultMinutes;
  selectedSchema = `${selectedSessionType}-${selectedDuration}`;

  durationChoices.replaceChildren(...type.durations.map((minutes) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "duration-choice";
    button.dataset.minutes = String(minutes);
    button.textContent = minutes === 120 ? "2 hr" : minutes === 90 ? "1 hr 30" : `${minutes} min`;
    const active = minutes === selectedDuration;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      selectedDuration = minutes;
      selectedSchema = `${selectedSessionType}-${selectedDuration}`;
      renderDurationChoices();
      updateSummary();
    });
    return button;
  }));

  sessionTypeButtons.forEach((button) => {
    const active = button.dataset.sessionType === selectedSessionType;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setShell(schema) {
  const match = /^(academy|private)-(30|45|60|75|90|120)$/.exec(String(schema || ""));
  if (match) {
    selectedSessionType = match[1];
    selectedDuration = Number(match[2]);
  } else {
    selectedSessionType = "academy";
    selectedDuration = 60;
  }
  renderDurationChoices();
}

function createSessionPayload(practiceId = activePracticeId) {
  const program = getProgramData();
  const room = selectedRoom();
  if (!program.discipline || !room) return null;
  const shell = shellData();
  const week = programUsesWeek() ? weekSelect.value : "";
  return {
    schema: selectedSchema,
    durationMinutes: shell.minutes,
    xpTimeScale: shell.minutes >= 120 ? "two-hour" : shell.minutes >= 90 ? "ninety-minute" : "standard",
    executionMode: selectedMode,
    practiceId: String(practiceId || ""),
    sessionId: room.value,
    locationId: room.locationId,
    academyId: room.locationId,
    roomId: room.roomId,
    roomValue: room.value,
    ...program,
    rank: program.tier,
    week,
    ...getHybridData(week),
    source: "session-builder",
    createdAt: new Date().toISOString()
  };
}

function persistSession(payload) {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(CLIPBOARD_KEY);
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  writeCompatibilityKeys(payload);
}

async function openCanonicalPractice(payload) {
  await requireCoach();
  const openPractice = httpsCallable(functions, "openPracticeSession");
  const response = await openPractice({
    practiceId: payload.practiceId,
    liveSessionId: payload.sessionId,
    locationId: payload.locationId,
    academyId: payload.locationId,
    roomId: payload.roomId,
    discipline: payload.discipline,
    journey: payload.journey,
    program: payload.program,
    track: payload.track,
    tier: payload.tier,
    schema: payload.schema,
    executionMode: payload.executionMode,
    durationMinutes: payload.durationMinutes
  });
  const practiceId = String(response.data?.practiceId || "").trim();
  if (!practiceId) throw new Error("Practice identity was not returned.");
  activePracticeId = practiceId;
  return { ...payload, practiceId };
}

function clearAttendanceContext() {
  document.getElementById("attendanceContext").hidden = true;
}

function renderAttendanceContext(attendance = {}) {
  const participants = attendanceParticipants(attendance);
  const ranks = attendanceRankSummary(attendance);
  const section = document.getElementById("attendanceContext");
  section.hidden = false;
  document.getElementById("attendanceCount").textContent = `${participants.length} checked in`;
  const rankEl = document.getElementById("attendanceRanks");
  rankEl.replaceChildren(...ranks.map(({ label, count }) => {
    const chip = document.createElement("span");
    chip.textContent = `${label}: ${count}`;
    return chip;
  }));
  const athletesEl = document.getElementById("attendanceAthletes");
  athletesEl.replaceChildren(...participants.map((athlete) => {
    const chip = document.createElement("span");
    const detail = [athlete.athleteId, athlete.journey, athlete.rank || athlete.tier].filter(Boolean).join(" · ");
    const name = document.createElement("strong");
    name.textContent = athlete.name;
    const small = document.createElement("small");
    small.textContent = detail;
    chip.append(name, small);
    return chip;
  }));
  document.getElementById("attendanceLink").href = `/coaches/attendance/session.html?practiceId=${encodeURIComponent(activePracticeId)}&return=builder`;
}

async function loadAttendanceContext() {
  if (!activePracticeId) return clearAttendanceContext();
  const snapshot = await getDoc(doc(db, "attendance_sessions", activePracticeId));
  renderAttendanceContext(snapshot.exists() ? snapshot.data() || {} : {});
}

async function restoreCanonicalPractice(practiceId) {
  await requireCoach();
  showPrePracticeSetup();
  const getPractice = httpsCallable(functions, "getPracticeSession");
  const response = await getPractice({ practiceId });
  const practice = response.data?.practice || {};
  if (String(practice.status || "").toLowerCase() !== "active") throw new Error("This practice is no longer active.");
  const room = SESSION_ROOMS.find((candidate) =>
    candidate.locationId === String(practice.locationId || practice.academyId || "")
      && candidate.roomId === String(practice.roomId || "")
  );
  if (!room) throw new Error("The practice room is not available in Session Builder.");
  activePracticeId = String(practiceId || "");
  populateRooms(room.value);
  if (disciplineFamilySelect) disciplineFamilySelect.value = String(practice.discipline || "");
  populatePrograms(String(practice.program || ""));
  setShell(String(practice.schema || "academy-60"));
  selectedMode = normalizeExecutionMode(practice.executionMode, "manual");
  populateRanks(String(practice.tier || ""));
  roomSelect.disabled = true;
  await refreshHybridAvailability();
  await loadAttendanceContext();
  document.getElementById("dashboardNotice").textContent = "Canonical practice restored. Continue planning with the same practice ID.";
  document.getElementById("dashboardNotice").hidden = false;
}

setupPrePracticeBtn?.addEventListener("click", showPrePracticeSetup);
skipCleanSlateBtn?.addEventListener("click", skipToPractice);

sessionTypeButtons.forEach(button => button.addEventListener("click", () => {
  selectedSessionType = button.dataset.sessionType || "academy";
  selectedDuration = SESSION_TYPES[selectedSessionType]?.defaultMinutes || 60;
  renderDurationChoices();
  updateSummary();
}));

modeButtons.forEach(button => button.addEventListener("click", () => {
  selectedMode = button.dataset.mode || "hybrid";
  updateModeButtons();
  updateConditionalControls();
  updateSummary();
}));

roomSelect.addEventListener("change", () => {
  const previous = disciplineSelect.value;
  populatePrograms(previous);
  populateRanks();
  refreshHybridAvailability();
});

disciplineFamilySelect?.addEventListener("change", () => {
  populatePrograms("");
  populateRanks();
  refreshHybridAvailability();
});

disciplineSelect.addEventListener("change", () => {
  const program = selectedProgram();
  if (program && disciplineFamilySelect) disciplineFamilySelect.value = program.discipline;
  populateRanks();
  refreshHybridAvailability();
});
rankSelect.addEventListener("change", refreshHybridAvailability);
weekSelect.addEventListener("change", updateSummary);

document.getElementById("discardDraftBtn").addEventListener("click", () => {
  if (!window.confirm("Discard this unfinished session?")) return;
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(CLIPBOARD_KEY);
  renderDraft();
});

buildBtn.addEventListener("click", async () => {
  const existingDraft = getRecoverableDraft();
  if (existingDraft && !window.confirm("Starting a new session will replace the unfinished Clipboard draft. Continue?")) return;
  let payload = createSessionPayload();
  if (!payload) return;
  buildBtn.disabled = true;
  try {
    if (selectedMode === "checked-in" && !activePracticeId) {
      payload = await openCanonicalPractice(payload);
      persistSession(payload);
      window.location.href = `/coaches/attendance/session.html?practiceId=${encodeURIComponent(payload.practiceId)}&return=builder`;
      return;
    }
    if (selectedMode === "quick") payload = await openCanonicalPractice(payload);
    persistSession(payload);
    window.location.href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(payload.sessionId)}`;
  } catch (error) {
    console.error("Session entry failed", error);
    const noticeEl = document.getElementById("dashboardNotice");
    noticeEl.textContent = error?.message || "Could not start this session.";
    noticeEl.hidden = false;
    buildBtn.disabled = false;
  }
});

populateRooms();
populatePrograms();
populateWeeks();
populateRanks();
renderDurationChoices();
renderDraft();

const notice = new URLSearchParams(window.location.search).get("notice");
if (notice === "choose-session") {
  const noticeEl = document.getElementById("dashboardNotice");
  noticeEl.textContent = "Choose the session setup first.";
  noticeEl.hidden = false;
}

const requestedPracticeId = String(new URLSearchParams(window.location.search).get("practiceId") || "").trim();
if (requestedPracticeId) {
  restoreCanonicalPractice(requestedPracticeId).catch((error) => {
    console.error("Practice restore failed", error);
    const noticeEl = document.getElementById("dashboardNotice");
    noticeEl.textContent = error?.message || "Could not restore the canonical practice.";
    noticeEl.hidden = false;
    refreshHybridAvailability();
  });
} else {
  refreshHybridAvailability();
}
