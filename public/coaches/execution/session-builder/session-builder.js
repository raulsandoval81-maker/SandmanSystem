import {
  LADDER_YOUTH,
  LADDER_F4,
  LADDER_Q2M
} from "/assets/js/ladder.service.js";
import {
  db,
  doc,
  ensureSignedIn,
  functions,
  getDoc,
  httpsCallable
} from "/assets/js/firebase-init.js";
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

const SHELLS = Object.freeze({
  "quick-45": { label: "Quick Combat", minutes: 45 },
  "standard-60": { label: "Standard Combat", minutes: 60 },
  "elite-90": { label: "Advanced Combat", minutes: 90 },
  "extended-120": { label: "Extended Combat", minutes: 120 },
  "fitness-striking-60": { label: "Striking Fitness", minutes: 60 }
});

const RANK_LADDERS = Object.freeze({
  Z2H: LADDER_YOUTH,
  P2L: LADDER_F4,
  Q2M: LADDER_Q2M
});

const shellCards = [...document.querySelectorAll(".session-card")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
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

let selectedSchema = "standard-60";
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
  roomSelect.innerHTML = "";
  SESSION_ROOMS.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.value;
    option.textContent = room.label;
    roomSelect.appendChild(option);
  });
  if (roomByValue(preferredValue)) roomSelect.value = preferredValue;
}

function populatePrograms(preferredProgramId = "") {
  const room = selectedRoom();
  const programs = programsForLocation(room?.locationId || "");
  const groups = new Map();
  disciplineSelect.innerHTML = '<option value="">Select Program</option>';
  programs.forEach((program) => {
    if (!groups.has(program.groupLabel)) {
      const group = document.createElement("optgroup");
      group.label = program.groupLabel;
      groups.set(program.groupLabel, group);
      disciplineSelect.appendChild(group);
    }
    const option = document.createElement("option");
    option.value = program.programId;
    option.textContent = program.label;
    groups.get(program.groupLabel).appendChild(option);
  });
  if (programs.some((program) => program.programId === preferredProgramId)) {
    disciplineSelect.value = preferredProgramId;
  }
}

function programUsesRank() {
  return Boolean(selectedProgram()?.journey && RANK_LADDERS[selectedProgram().journey]);
}

function programUsesWeek() {
  return programUsesRank() && selectedMode === "hybrid" && hybridUsable;
}

function isManualOnlyProgram() {
  const program = selectedProgram();
  return !program?.hybrid || selectedSchema === "fitness-striking-60";
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

  if (!programUsesRank() || isManualOnlyProgram()) {
    if (selectedMode === "hybrid") {
      selectedMode = "manual";
      modeWasForced = true;
    }
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
      console.warn("Hybrid model unavailable:", path, error);
    }
  }

  if (!hybridUsable && selectedMode === "hybrid") {
    selectedMode = "manual";
    modeWasForced = true;
  } else if (modeWasForced) {
    selectedMode = "hybrid";
    modeWasForced = false;
  }
  updateModeButtons();
  updateConditionalControls();
  updateSummary();
}

function updateModeButtons() {
  modeButtons.forEach(button => {
    const isHybrid = button.dataset.mode === "hybrid";
    button.disabled = isHybrid && !hybridUsable;
    const active = button.dataset.mode === selectedMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateConditionalControls() {
  const usesRank = programUsesRank();
  const manualOnly = isManualOnlyProgram();
  rankField.hidden = !usesRank;
  weekField.hidden = !programUsesWeek();
  modeField.hidden = false;
  modeAvailability.hidden = false;

  if (manualOnly) {
    modeAvailability.textContent = "";
    modeAvailability.classList.remove("unavailable");
  } else if (hybridUsable) {
    modeAvailability.textContent = "Hybrid suggestions are available for this program and rank.";
    modeAvailability.classList.remove("unavailable");
  } else {
    modeAvailability.textContent = "Hybrid suggestions are not available for this program and rank.";
    modeAvailability.classList.add("unavailable");
  }
}

function shellData() {
  return SHELLS[selectedSchema] || SHELLS["standard-60"];
}

function getProgramData() {
  const program = selectedProgram();
  const tier = programUsesRank() ? rankSelect.value : "";
  const journey = program?.journey || "";
  const ladder = RANK_LADDERS[journey] || [];
  const rankName = ladder.find(rank => tierFromLadderKey(rank.key) === tier)?.name || "";

  return {
    program: program?.programId || "",
    foundry: program?.foundry || "",
    track: program?.track || "",
    journey,
    discipline: program?.discipline || "",
    tier,
    rankLabel: rankName
  };
}

function updateSummary() {
  const shell = shellData();
  const program = getProgramData();
  const room = optionText(roomSelect) || "Choose a room";
  const usesRank = programUsesRank();
  const usesWeek = programUsesWeek();

  document.getElementById("currentRoomLabel").textContent = room;
  document.getElementById("summaryShell").textContent = `${shell.label} · ${shell.minutes} min`;
  document.getElementById("summaryRoom").textContent = room;
  document.getElementById("summaryProgram").textContent = optionText(disciplineSelect) || "Select a program";
  document.getElementById("summaryRankRow").hidden = !usesRank;
  document.getElementById("summaryRank").textContent = usesRank ? (optionText(rankSelect) || "Select a rank") : "—";
  document.getElementById("summaryWeekRow").hidden = !usesWeek;
  document.getElementById("summaryWeek").textContent = usesWeek ? (optionText(weekSelect) || "Select a week") : "—";
  const modeLabels = { "checked-in": "Checked-In", hybrid: "Hybrid", manual: "Manual", quick: "Quick Start" };
  document.getElementById("summaryMode").textContent = modeLabels[selectedMode] || "Manual";

  if (selectedMode === "checked-in") {
    summaryAvailability.textContent = activePracticeId
      ? "Canonical practice and attendance context are ready."
      : "Open Attendance first, then return to plan with the checked-in room.";
  } else if (selectedMode === "quick") {
    summaryAvailability.textContent = "Quick Start uses the Quick 45 shell and the shared Clipboard/Clock engine.";
  } else if (isManualOnlyProgram()) {
    summaryAvailability.textContent = "Manual session shell.";
  } else if (hybridUsable) {
    summaryAvailability.textContent = selectedMode === "hybrid" ? "Hybrid suggestions will be added in Clipboard." : "Manual planning selected; no Hybrid suggestions will be added.";
  } else if (disciplineSelect?.value) {
    summaryAvailability.textContent = "Hybrid suggestions are not available for this program and rank. Manual planning will be used.";
  } else {
    summaryAvailability.textContent = "Choose a program to check Hybrid availability.";
  }

  buildBtn.disabled = !program.program || !selectedRoom();
  buildBtn.textContent = selectedMode === "checked-in" && !activePracticeId
    ? "Open Attendance Check-In"
    : selectedMode === "checked-in"
      ? "Continue to Practice Clipboard"
      : selectedMode === "quick"
        ? "Start Quick 45"
        : "Build in Practice Clipboard";
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
  const shell = SHELLS[draft.schema || session.schema] || { label: "Practice", minutes: draft.durationMinutes || 0 };
  const blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
  const cards = Array.isArray(draft.cards) ? draft.cards : [];
  const noteCount = blocks.filter(block => String(block.notes || "").trim()).length + (String(draft.focus || "").trim() ? 1 : 0);
  const allocated = blocks.filter(block => block.visible !== false).reduce((sum, block) => sum + Number(block.minutes || 0), 0);
  const identity = [session.discipline, session.tier && session.rankLabel ? `${session.tier} ${session.rankLabel}` : session.tier, session.week ? `Week ${session.week}` : "", session.executionMode === "hybrid" ? "Hybrid" : "Manual"].filter(Boolean).join(" · ");

  document.getElementById("draftLifecycle").textContent = draft.lifecycle === "launched" ? "Sent to Clock" : "Editing";
  document.getElementById("draftTitle").textContent = `${shell.label} · ${shell.minutes || session.durationMinutes || 0} min · ${session.sessionId || "Room"}`;
  document.getElementById("draftUpdated").textContent = formatUpdated(draft.updatedAt);
  document.getElementById("draftIdentity").textContent = identity || "Manual coach-built session";
  document.getElementById("draftMetrics").textContent = `${cards.length} cards · ${noteCount} notes · ${allocated}/${shell.minutes || session.durationMinutes || allocated} min allocated`;
  document.getElementById("continueDraftBtn").href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(session.sessionId || "lompoc-mat-1")}`;
}

function getHybridData(weekValue) {
  if (selectedMode !== "hybrid" || !hybridUsable || !hybridModel) {
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

function setShell(schema) {
  selectedSchema = SHELLS[schema] ? schema : "standard-60";
  shellCards.forEach((card) => {
    const active = card.dataset.schema === selectedSchema;
    card.classList.toggle("active", active);
    card.setAttribute("aria-pressed", String(active));
  });
}

function createSessionPayload(practiceId = activePracticeId) {
  const program = getProgramData();
  const room = selectedRoom();
  if (!program.program || !room) return null;
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
  await ensureSignedIn();
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
  await ensureSignedIn();
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
  populatePrograms(String(practice.program || ""));
  setShell(String(practice.schema || "standard-60"));
  selectedMode = normalizeExecutionMode(practice.executionMode, "manual");
  populateRanks(String(practice.tier || ""));
  roomSelect.disabled = true;
  await refreshHybridAvailability();
  await loadAttendanceContext();
  document.getElementById("dashboardNotice").textContent = "Canonical practice restored. Continue planning with the same practice ID.";
  document.getElementById("dashboardNotice").hidden = false;
}

shellCards.forEach(card => card.addEventListener("click", () => {
  setShell(card.dataset.schema || "standard-60");
  if (selectedSchema === "fitness-striking-60") {
    disciplineSelect.value = "fitness-striking";
    populateRanks();
  }
  refreshHybridAvailability();
}));

modeButtons.forEach(button => button.addEventListener("click", () => {
  if (button.disabled) return;
  selectedMode = button.dataset.mode || "manual";
  if (selectedMode === "quick") setShell("quick-45");
  modeWasForced = false;
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
disciplineSelect.addEventListener("change", () => {
  if (disciplineSelect.value === "fitness-striking") {
    setShell("fitness-striking-60");
  }
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
renderDraft();

const notice = new URLSearchParams(window.location.search).get("notice");
if (notice === "choose-session") {
  const noticeEl = document.getElementById("dashboardNotice");
  noticeEl.textContent = "Choose a session shell first.";
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
