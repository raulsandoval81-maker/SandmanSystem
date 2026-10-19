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
import {
  DEFAULT_HYBRID_PLANNING_SOURCES,
  acceptedCardsForGroup,
  composeGroupPlanning,
  editableGroupPlanning,
  enabledPlanningSources,
  normalizePlanningSources
} from "/coaches/execution/session-builder/hybrid-planning-policy.js";

const SESSION_KEY = "sandman_session_builder_v1";
const CLIPBOARD_KEY = "sandman_clipboard_v1";
const DRAFT_KEY = "sandman_clipboard_draft_v1";
const BIG_CLOCK_PAYLOAD_KEY = "sandman_big_clock_payload_v2";
const PRACTICE_ENTRY_KEY = "sandman_practice_entry_v1";

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
const journeySelect = document.getElementById("journeySelect");
const journeyField = document.getElementById("journeyField");
const disciplineField = document.getElementById("disciplineField");
const disciplineFamilySelect = document.getElementById("disciplineFamilySelect");
const programField = document.getElementById("programField");
const roomSelect = document.getElementById("roomSelect");
const disciplineSelect = document.getElementById("disciplineSelect");
const rankSelect = document.getElementById("rankSelect");
const weekSelect = document.getElementById("weekSelect");
const rankField = document.getElementById("rankField");
const weekField = document.getElementById("weekField");
const rankModeLabel = document.getElementById("rankModeLabel");
const weekModeLabel = document.getElementById("weekModeLabel");
const rankSuggestion = document.getElementById("rankSuggestion");
const weekSuggestion = document.getElementById("weekSuggestion");
const modeField = document.getElementById("modeField");
const buildBtn = document.getElementById("buildBtn");
const modeAvailability = document.getElementById("modeAvailability");
const summaryAvailability = document.getElementById("summaryAvailability");
const currentSessionSection = document.getElementById("currentSessionSection");
const newSessionSection = document.getElementById("newSessionSection");
const guidedSetupScreen = document.getElementById("guidedSetupScreen");
const practiceContextScreen = document.getElementById("practiceContextScreen");
const continueToContextBtn = document.getElementById("continueToContextBtn");
const backToGuidedSetupBtn = document.getElementById("backToGuidedSetupBtn");
const hybridPlanningPanel = document.getElementById("hybridPlanningPanel");
const hybridGroupPlanning = document.getElementById("hybridGroupPlanning");
const planningSourceStatus = document.getElementById("planningSourceStatus");
const planningSourceInputs = [...document.querySelectorAll("[data-planning-source]")];

let selectedSessionType = "academy";
let selectedDuration = 60;
let selectedSchema = "academy-60";
let selectedMode = "hybrid";
let hybridModel = null;
let hybridUsable = false;
let availabilityRequest = 0;
let modeWasForced = false;
let activePracticeId = "";
let suggestedTier = "";
let suggestedWeek = "";
let planningSources = { ...DEFAULT_HYBRID_PLANNING_SOURCES };
let groupPlanningDraft = {};
const groupWaveModels = new Map();
const MIXED_JOURNEY = "__mixed__";

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function practiceEntryIntent() {
  try {
    return JSON.parse(sessionStorage.getItem(PRACTICE_ENTRY_KEY) || "null") || {};
  } catch {
    return {};
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

function selectedMatLabel() {
  return "Mat 1";
}


function selectedProgram() {
  return programById(disciplineSelect?.value || "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeCoachCardHref(value = "") {
  const href = String(value || "");
  return href.startsWith("/coaches/cards/") && href.endsWith(".html") && !href.includes("..") && !href.includes("?") && !href.includes("#")
    ? href
    : "";
}

function programForGroup(group = {}) {
  const journey = String(group.journey || "").toUpperCase();
  const discipline = String(group.discipline || "").toLowerCase();
  return SESSION_PROGRAMS.find(program =>
    String(program.journey || "").toUpperCase() === journey &&
    String(program.discipline || "").toLowerCase() === discipline
  ) || null;
}

async function waveModelForGroup(group = {}) {
  const program = programForGroup(group);
  const tier = String(group.tier || "").toLowerCase();
  const prefix = program?.hybridModelPrefix || "";
  if (!prefix || !/^t[0-4]$/.test(tier)) return null;
  const path = `${prefix}-${tier}-waves.js`;
  if (!groupWaveModels.has(path)) {
    groupWaveModels.set(path, import(path).catch(() => null));
  }
  return groupWaveModels.get(path);
}

function readPlanningSources() {
  return normalizePlanningSources(Object.fromEntries(planningSourceInputs.map(input => [input.dataset.planningSource, input.checked])), selectedMode);
}

async function renderHybridPlanning() {
  if (!hybridPlanningPanel) return;
  hybridPlanningPanel.hidden = selectedMode !== "hybrid";
  if (selectedMode !== "hybrid") return;
  planningSources = readPlanningSources();
  const enabled = enabledPlanningSources(planningSources);
  const remembered = readJson(SESSION_KEY, {});
  const groups = String(remembered.practiceId || "") === String(activePracticeId || "")
    ? (Array.isArray(remembered.trainingGroups) ? remembered.trainingGroups.slice(0, 3) : [])
    : [];
  planningSourceStatus.textContent = enabled.length
    ? `${enabled.length} planning source${enabled.length === 1 ? "" : "s"} enabled. Coach approval is required before curriculum cards enter the lesson.`
    : "No HYBRID source is enabled. Enable a source or switch to MANUAL.";
  planningSourceStatus.classList.toggle("unavailable", !enabled.length);
  if (!groups.length) {
    hybridGroupPlanning.innerHTML = '<p class="empty-state">Complete Attendance and Practice Groups first. You will return here to review each group’s plan.</p>';
    return;
  }
  const cards = [];
  for (const group of groups) {
    const model = planningSources.tierWaves ? await waveModelForGroup(group) : null;
    const waves = Object.entries(model?.WAVE_CARDS || {}).filter(([, value]) => Array.isArray(value) && value.length);
    const prior = editableGroupPlanning(groupPlanningDraft[group.id] || remembered.groupPlanning?.[group.id] || {}, group);
    const selectedWave = prior.selectedWave;
    const waveCards = waves.find(([key]) => key === selectedWave)?.[1] || [];
    cards.push(`<article class="hybrid-group-card" data-group-id="${escapeHtml(group.id)}">
      <h4>${escapeHtml(group.label || group.id)} · ${escapeHtml(group.journey)} ${escapeHtml(String(group.tier || "").toUpperCase())}</h4>
      ${planningSources.tierWaves ? (waves.length ? `<label>Tier Wave<select class="hybrid-wave-select" data-group-id="${escapeHtml(group.id)}"><option value="">Select and accept a wave</option>${waves.map(([key]) => `<option value="${escapeHtml(key)}"${key === selectedWave ? " selected" : ""}>${escapeHtml(key.replaceAll("_", " "))}</option>`).join("")}</select></label><div class="hybrid-wave-cards">${waveCards.map(card => safeCoachCardHref(card.href) ? `<a href="${escapeHtml(safeCoachCardHref(card.href))}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.title || card.id)}</a>` : `<span>${escapeHtml(card.title || card.id)} (link unavailable)</span>`).join("")}</div><p>Curriculum placement only. Selecting a wave accepts it for this lesson; it does not verify athlete progression.</p>` : '<p class="planning-unavailable">Tier Wave mapping unavailable for this Journey, discipline, or tier.</p>') : ""}
      ${planningSources.systemSuggestions ? '<p class="planning-unavailable"><strong>System Suggestions:</strong> unavailable until authoritative athlete-history recommendations are connected. No diagnostic preview is treated as verified.</p>' : ""}
      ${planningSources.coachInput ? `<p><strong>Original carry-forward:</strong> ${escapeHtml(group.carryForwardNote || "None recorded")}</p><label>Use prior note<select class="hybrid-note-disposition" data-group-id="${escapeHtml(group.id)}"><option value="accepted"${prior.disposition === "accepted" ? " selected" : ""}>Accept</option><option value="edited"${prior.disposition === "edited" ? " selected" : ""}>Edit</option><option value="dismissed"${prior.disposition === "dismissed" ? " selected" : ""}>Dismiss</option><option value="replaced"${prior.disposition === "replaced" ? " selected" : ""}>Replace</option></select></label><label>Current Coach instructions<textarea class="hybrid-coach-note" data-group-id="${escapeHtml(group.id)}" rows="3" placeholder="Instructions for this practice">${escapeHtml(prior.currentNote || "")}</textarea></label><p>Coach observations remain unverified until the normal evidence process is completed.</p>` : ""}
    </article>`);
  }
  hybridGroupPlanning.innerHTML = cards.join("");
  hybridGroupPlanning.querySelectorAll(".hybrid-wave-select").forEach(select => select.addEventListener("change", () => {
    groupPlanningDraft[select.dataset.groupId] = { ...(groupPlanningDraft[select.dataset.groupId] || {}), selectedWave: select.value };
    renderHybridPlanning();
  }));
  hybridGroupPlanning.querySelectorAll(".hybrid-note-disposition,.hybrid-coach-note").forEach(input => input.addEventListener("input", () => {
    const card = input.closest(".hybrid-group-card");
    const id = input.dataset.groupId;
    groupPlanningDraft[id] = {
      ...(groupPlanningDraft[id] || {}),
      disposition: card.querySelector(".hybrid-note-disposition")?.value || "dismissed",
      currentNote: card.querySelector(".hybrid-coach-note")?.value || ""
    };
  }));
}

function roomHasGuidedPrograms(room) {
  if (!room) return false;
  return programsForLocation(room.locationId)
    .some((program) => !["manual-build", "fitness-striking"].includes(program.programId));
}

function populateRooms(preferredValue = "") {
  const entryRoom = String(practiceEntryIntent().roomValue || "");
  const rememberedRoom = readJson(SESSION_KEY, {})?.roomValue || "";
  roomSelect.innerHTML = "";

  SESSION_ROOMS.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.value;
    option.textContent = room.label;
    roomSelect.appendChild(option);
  });

  const preferredRoom = roomByValue(preferredValue);
  const remembered = roomByValue(rememberedRoom);
  const guidedDefault = SESSION_ROOMS.find(roomHasGuidedPrograms);

  const entry = roomByValue(entryRoom);
  const selected =
    (preferredRoom && roomHasGuidedPrograms(preferredRoom) ? preferredRoom : null) ||
    (entry && roomHasGuidedPrograms(entry) ? entry : null) ||
    (remembered && roomHasGuidedPrograms(remembered) ? remembered : null) ||
    guidedDefault ||
    preferredRoom ||
    remembered ||
    SESSION_ROOMS[0];

  if (selected) roomSelect.value = selected.value;
}

function journeyLabel(code = "") {
  return ({ Z2H: "Road2Champion", P2L: "Path2Legend", Q2M: "Quest2Mastery" })[code] || code;
}

function availablePrograms() {
  const room = selectedRoom();
  return programsForLocation(room?.locationId || "")
    .filter((program) => !["manual-build", "fitness-striking"].includes(program.programId));
}

function disciplineLabel(value = "") {
  return ({
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
    mma: "MMA",
    "submission-grappling": "Submission Grappling"
  })[value] || value;
}

function updateDisciplineAvailability(preferredDiscipline = "") {
  const disciplines = [...new Set(availablePrograms().map((program) => program.discipline).filter(Boolean))];

  disciplineFamilySelect.innerHTML = '<option value="">Select Discipline</option>';
  disciplines.forEach((discipline) => {
    const option = document.createElement("option");
    option.value = discipline;
    option.textContent = disciplineLabel(discipline);
    disciplineFamilySelect.appendChild(option);
  });

  if (disciplines.includes(preferredDiscipline)) {
    disciplineFamilySelect.value = preferredDiscipline;
  } else if (!disciplines.includes(String(disciplineFamilySelect?.value || ""))) {
    disciplineFamilySelect.value = "";
  }

  if (disciplineField) disciplineField.hidden = false;
}

function populateJourneys(preferredJourney = "") {
  const discipline = String(disciplineFamilySelect?.value || "").trim();
  const programs = availablePrograms().filter((program) => discipline && program.discipline === discipline);
  const journeys = [...new Set(programs.map((program) => program.journey).filter(Boolean))];

  journeySelect.innerHTML = '<option value="">Mixed Room · All Journeys</option>';
  journeys.forEach((journey) => {
    const option = document.createElement("option");
    option.value = journey;
    option.textContent = journeyLabel(journey);
    journeySelect.appendChild(option);
  });

  journeySelect.value = journeys.includes(preferredJourney) ? preferredJourney : "";
  if (journeyField) journeyField.hidden = !discipline;
}

function populatePrograms(preferredProgramId = "") {
  const discipline = String(disciplineFamilySelect?.value || "").trim();

  disciplineSelect.innerHTML = '<option value="">Select Discipline</option>';

  if (discipline) {
    const option = document.createElement("option");
    option.value = "attendance-routed";
    option.textContent = "Attendance Routed";
    disciplineSelect.appendChild(option);
    disciplineSelect.value = "attendance-routed";
  }

  if (programField) programField.hidden = true;
}

function matchingPriorFocus() {
  const remembered = readJson(SESSION_KEY, {});
  const currentProgram = selectedProgram();
  if (!currentProgram) return { tier: "", week: "" };

  const sameJourney = String(remembered?.journey || "") === String(currentProgram.journey || "");
  const sameDiscipline = String(remembered?.discipline || "").toLowerCase() === String(currentProgram.discipline || "").toLowerCase();
  if (!sameJourney || !sameDiscipline) return { tier: "", week: "" };

  return {
    tier: String(remembered?.tier || remembered?.rank || "").trim(),
    week: String(remembered?.week || "").trim()
  };
}

function refreshFocusSuggestion({ apply = true } = {}) {
  const suggestion = matchingPriorFocus();
  suggestedTier = suggestion.tier;
  suggestedWeek = suggestion.week;

  if (!rankSelect || !weekSelect) return;

  if (apply && selectedMode === "hybrid") {
    if (!rankSelect.value && suggestedTier && [...rankSelect.options].some((option) => option.value === suggestedTier)) {
      rankSelect.value = suggestedTier;
    }
    if (!weekSelect.value && suggestedWeek && [...weekSelect.options].some((option) => option.value === suggestedWeek)) {
      weekSelect.value = suggestedWeek;
    }
  }

  if (apply && selectedMode === "auto") {
    if (suggestedTier && [...rankSelect.options].some((option) => option.value === suggestedTier)) {
      rankSelect.value = suggestedTier;
    } else {
      rankSelect.value = "";
    }
    if (suggestedWeek && [...weekSelect.options].some((option) => option.value === suggestedWeek)) {
      weekSelect.value = suggestedWeek;
    } else {
      weekSelect.value = "";
    }
  }
}

function effectiveTier() {
  if (!rankSelect || !programUsesRank()) return "";
  if (selectedMode === "auto") return suggestedTier || "";
  return String(rankSelect.value || "");
}

function effectiveWeek() {
  if (!weekSelect || !programUsesRank()) return "";
  if (selectedMode === "auto") return suggestedWeek || "";
  return String(weekSelect.value || "");
}

function programUsesRank() {
  return Boolean(selectedProgram()?.journey && RANK_LADDERS[selectedProgram().journey]);
}

function programUsesWeek() {
  return programUsesRank();
}

function isManualOnlyProgram() {
  return false;
}

function tierFromLadderKey(key = "") {
  return String(key).replace(/^R/i, "T");
}

function populateRanks(preferredTier = "") {
  if (!rankSelect) return;
  const journey = selectedProgram()?.journey || "";
  const ladder = RANK_LADDERS[journey] || [];
  rankSelect.innerHTML = "";

  const blank = document.createElement("option");
  blank.value = "";
  const routeReady = Boolean(journeySelect?.value && disciplineFamilySelect?.value);
  blank.textContent = !routeReady
    ? "Select Discipline"
    : ladder.length
      ? "Let Sandman decide / no tier"
      : "Not needed";
  rankSelect.appendChild(blank);

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
  if (!weekSelect) return;
  const routeReady = Boolean(journeySelect?.value && disciplineFamilySelect?.value);
  weekSelect.innerHTML = routeReady
    ? '<option value="">Let Sandman decide / select week</option>'
    : '<option value="">Select Discipline</option>';

  if (!routeReady) return;

  for (let week = 1; week <= 36; week += 1) {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    weekSelect.appendChild(option);
  }
}

function getModelPath() {
  // AUTO and HYBRID share approved curriculum. MANUAL receives no prescription.
  if (!["auto", "hybrid"].includes(selectedMode)) return "";
  const program = selectedProgram();
  const prefix = program?.hybridModelPrefix || "";
  const remembered = readJson(SESSION_KEY, {});
  const samePractice = Boolean(activePracticeId) &&
    String(remembered.practiceId || "") === String(activePracticeId);
  const tier = String(
    (samePractice && remembered.tier) || effectiveTier() || rankSelect?.value || ""
  ).toLowerCase();
  // The existing boxing mappings contain kickboxing-only material. Never prescribe it automatically.
  if (String(program?.discipline || "").toLowerCase() === "boxing") return "";
  return prefix && /^t[0-4]$/.test(tier) ? `${prefix}-${tier}-waves.js` : "";
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
  renderHybridPlanning();
}

function updateConditionalControls() {
  if (rankField) rankField.hidden = true;
  if (weekField) weekField.hidden = true;
  if (modeAvailability) {
    modeAvailability.textContent = "Attendance supplies group rank and tier; verified skill progression is not yet connected. AUTO launch remains blocked until validation is available.";
    modeAvailability.hidden = false;
    modeAvailability.classList.remove("unavailable");
  }
  return;

  const usesRank = programUsesRank();
  const routeReady = Boolean(journeySelect?.value && disciplineFamilySelect?.value);

  if (!routeReady) {
    rankSelect.disabled = true;
    weekSelect.disabled = true;
    if (rankModeLabel) rankModeLabel.textContent = "";
    if (weekModeLabel) weekModeLabel.textContent = "";
    modeAvailability.textContent = "Choose a Journey and Discipline to establish the practice route.";
    if (rankSuggestion) rankSuggestion.textContent = "";
    if (weekSuggestion) weekSuggestion.textContent = "";
  } else if (!usesRank) {
    rankSelect.disabled = true;
    weekSelect.disabled = true;
    if (rankModeLabel) rankModeLabel.textContent = "Not used";
    if (weekModeLabel) weekModeLabel.textContent = "Not used";
    modeAvailability.textContent = "This route does not currently use Tier or Training Week.";
    if (rankSuggestion) rankSuggestion.textContent = "";
    if (weekSuggestion) weekSuggestion.textContent = "";
  } else if (selectedMode === "auto") {
    rankSelect.disabled = true;
    weekSelect.disabled = true;
    if (rankModeLabel) rankModeLabel.textContent = "System choice";
    if (weekModeLabel) weekModeLabel.textContent = "System choice";
    if (rankSuggestion) rankSuggestion.textContent = suggestedTier
      ? `Sandman choice from the last matching session: ${optionText(rankSelect) || suggestedTier}.`
      : "No prior matching focus yet. Sandman will choose from available practice context.";
    if (weekSuggestion) weekSuggestion.textContent = suggestedWeek
      ? `Sandman choice from the last matching session: Week ${suggestedWeek}.`
      : "No prior matching week yet. Sandman will choose from available practice context.";
    modeAvailability.textContent = "Auto carries Sandman’s system choice into Attendance and Clipboard.";
  } else if (selectedMode === "hybrid") {
    rankSelect.disabled = false;
    weekSelect.disabled = false;
    if (rankModeLabel) rankModeLabel.textContent = "Suggested";
    if (weekModeLabel) weekModeLabel.textContent = "Suggested";
    if (rankSuggestion) rankSuggestion.textContent = suggestedTier
      ? "Sandman prefilled the last matching focus. Coach can change it."
      : "No prior matching focus yet. Coach may choose one or leave it to Sandman.";
    if (weekSuggestion) weekSuggestion.textContent = suggestedWeek
      ? "Sandman prefilled the last matching week. Coach can change it."
      : "No prior matching week yet. Coach may choose one or leave it to Sandman.";
    modeAvailability.textContent = hybridUsable
      ? "Hybrid uses Sandman suggestions with Coach override."
      : "Hybrid keeps Sandman suggestions optional and Coach-controlled.";
  } else {
    rankSelect.disabled = false;
    weekSelect.disabled = false;
    if (rankModeLabel) rankModeLabel.textContent = "Coach choice";
    if (weekModeLabel) weekModeLabel.textContent = "Coach choice";
    if (rankSuggestion) rankSuggestion.textContent = suggestedTier
      ? "Prior matching focus is available as reference; Coach makes the selection."
      : "Coach selects the focus tier.";
    if (weekSuggestion) weekSuggestion.textContent = suggestedWeek
      ? `Prior matching session used Week ${suggestedWeek}; Coach makes the selection.`
      : "Coach selects the training week.";
    modeAvailability.textContent = "Manual keeps Tier and Training Week with Coach.";
  }

  modeAvailability.hidden = false;
  modeAvailability.classList.remove("unavailable");
}

function shellData() {
  const type = SESSION_TYPES[selectedSessionType] || SESSION_TYPES.academy;
  return { label: type.label, minutes: selectedDuration };
}

function getProgramData() {
  const discipline = String(disciplineFamilySelect?.value || "").trim();
  return {
    program: discipline ? "attendance-routed" : "",
    foundry: "",
    track: "",
    journey: "",
    discipline,
    tier: "",
    rankLabel: ""
  };
}

function updateSummary() {
  const shell = shellData();
  const program = getProgramData();
  const usesRank = programUsesRank();
  const usesWeek = programUsesWeek();
  const summaryShell = document.getElementById("summaryShell");
  const summaryMode = document.getElementById("summaryMode");
  const summaryMat = document.getElementById("summaryMat");
  const summaryDiscipline = document.getElementById("summaryDiscipline");
  const summaryJourneyFilter = document.getElementById("summaryJourneyFilter");
  const summaryRankRow = document.getElementById("summaryRankRow");
  const summaryRank = document.getElementById("summaryRank");
  const summaryWeekRow = document.getElementById("summaryWeekRow");
  const summaryWeek = document.getElementById("summaryWeek");

  if (summaryShell) summaryShell.textContent = `${shell.label} · ${shell.minutes} min`;
  if (summaryMode) summaryMode.textContent = ({ auto: "Auto", hybrid: "Hybrid", manual: "Manual" })[selectedMode] || "Hybrid";
  if (summaryMat) summaryMat.textContent = selectedMatLabel();
  const disciplineReady = Boolean(disciplineFamilySelect?.value);

  disciplineFamilySelect?.classList.toggle("has-selection", disciplineReady);

  if (summaryDiscipline) {
    summaryDiscipline.textContent = disciplineReady
      ? disciplineFamilySelect?.selectedOptions?.[0]?.textContent?.trim() || "Select a discipline"
      : "Select a discipline";
    summaryDiscipline.classList.toggle("is-pending", !disciplineReady);
  }
  if (summaryJourneyFilter) {
    summaryJourneyFilter.textContent = journeySelect?.value
      ? journeyLabel(journeySelect.value)
      : "Mixed Room";
  }

  const routeReady = disciplineReady;

  if (summaryRankRow) summaryRankRow.hidden = false;
  if (summaryRank) {
    const tier = effectiveTier();
    if (!routeReady) summaryRank.textContent = "Select Discipline";
    else if (!usesRank) summaryRank.textContent = "Not used";
    else if (tier) summaryRank.textContent = optionText(rankSelect) || tier;
    else summaryRank.textContent = selectedMode === "auto" ? "Sandman chooses" : "Sandman decides / optional";
  }

  if (summaryWeekRow) summaryWeekRow.hidden = false;
  if (summaryWeek) {
    const week = "";
    if (!routeReady) summaryWeek.textContent = "Select Discipline";
    else if (!usesWeek) summaryWeek.textContent = "Not used";
    else if (week) summaryWeek.textContent = `Week ${week}`;
    else summaryWeek.textContent = selectedMode === "auto" ? "Sandman chooses" : "Sandman decides / optional";
  }

  if (!disciplineFamilySelect?.value) {
    summaryAvailability.textContent = "Choose a discipline to continue.";
  } else if (selectedMode === "auto") {
    summaryAvailability.textContent = "AUTO is not launch-ready: athlete skill progression is not verified. HYBRID can use available curriculum as an editable starting point.";
  } else if (selectedMode === "hybrid") {
    summaryAvailability.textContent = hybridUsable
      ? "Sandman suggestions will be available in Clipboard."
      : "Hybrid will use the context you provide and keep the rest flexible.";
  } else {
    summaryAvailability.textContent = "Coach controls the build in Practice Clipboard.";
  }

  const noHybridSources = selectedMode === "hybrid" && enabledPlanningSources(readPlanningSources()).length === 0;
  const autoBlocked = selectedMode === "auto";
  const reviewingPlan = Boolean(activePracticeId) && new URLSearchParams(window.location.search).get("planning") === "1";
  buildBtn.disabled = !program.discipline || !selectedRoom() || noHybridSources || autoBlocked;
  buildBtn.textContent = autoBlocked
    ? "AUTO Awaiting Certified Authorization"
    : reviewingPlan && selectedMode === "hybrid"
      ? "Accept Plan and Continue to Clipboard"
      : reviewingPlan
        ? "Continue to Clipboard"
        : "Continue to Attendance";
}

function showPrePracticeSetup() {
  if (currentSessionSection) currentSessionSection.hidden = true;
  if (newSessionSection) newSessionSection.hidden = false;
  if (guidedSetupScreen) guidedSetupScreen.hidden = false;
  if (practiceContextScreen) practiceContextScreen.hidden = true;
  updateSummary();
}

function showPracticeContext() {
  if (guidedSetupScreen) guidedSetupScreen.hidden = true;
  if (practiceContextScreen) practiceContextScreen.hidden = false;
  updateConditionalControls();
  updateSummary();
  practiceContextScreen?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // The old unfinished-session surface was removed from Screen 3.
  // Keep draft recovery data intact without requiring those DOM nodes.
  if (!card || !empty) return;

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
  document.getElementById("continueDraftBtn").href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(session.sessionId || "lompoc-mat-1a")}`;
}

function getHybridData(weekValue) {
  if (!["hybrid", "auto"].includes(selectedMode) || !hybridUsable || !hybridModel) {
    return { hybridPhase: "", hybridCycle: "", hybridWeekInCycle: "", hybridWaveKey: "", hybridWave: [], hybridCards: [], hybridRules: {} };
  }

  const weekNumber = Math.max(1, Number(weekValue || 1));
  const structure = hybridModel.WEEK_STRUCTURE || ["teach", "drill", "live"];
  const phase = structure[(weekNumber - 1) % structure.length] || "teach";
  const cycle = Math.ceil(weekNumber / 6);
  // Only select waves that have actual linked teaching cards. An empty wave is not a prescription.
  const waveKeys = Object.keys(hybridModel.WAVE_CARDS || {}).filter(
    key => Array.isArray(hybridModel.WAVE_CARDS[key]) && hybridModel.WAVE_CARDS[key].length
  );
  const waveKey = waveKeys.length ? waveKeys[(cycle - 1) % waveKeys.length] : "";
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
  let attendanceContext = {};
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    if (String(saved.practiceId || "") === String(practiceId || "") && practiceId) {
      attendanceContext = saved;
    }
  } catch {}
  const groups = Array.isArray(attendanceContext.trainingGroups) ? attendanceContext.trainingGroups : [];
  const week = String(attendanceContext.week || "");
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
    rank: attendanceContext.tier || program.tier,
    tier: attendanceContext.tier || program.tier,
    rankLabel: attendanceContext.rankLabel || program.rankLabel || "",
    trainingGroups: groups,
    planningSources: selectedMode === "hybrid" ? readPlanningSources() : {},
    groupPlanning: selectedMode === "hybrid" ? (attendanceContext.groupPlanning || {}) : {},
    attendanceJourneyFilter: String(journeySelect?.value || "").trim(),
    week,
    ...getHybridData(week),
    source: "session-builder",
    sessionDateKey: String(practiceEntryIntent().sessionDateKey || attendanceContext.sessionDateKey || ""),
    createdAt: new Date().toISOString()
  };
}

async function resolveGroupPrescriptions(payload) {
  if (payload.executionMode !== "hybrid") return payload;
  const groups = Array.isArray(payload.trainingGroups) ? payload.trainingGroups : [];
  if (!groups.length) return payload;
  const prescriptions = [];
  const groupPlanning = {};
  for (const group of groups) {
    const tier = String(group.tier || "").toLowerCase();
    const discipline = String(group.discipline || "").toLowerCase();
    const prior = editableGroupPlanning(groupPlanningDraft[group.id] || payload.groupPlanning?.[group.id] || {}, group);
    const selectedWave = prior.selectedWave;
    const model = await waveModelForGroup(group);
    const cards = Array.isArray(model?.WAVE_CARDS?.[selectedWave]) ? model.WAVE_CARDS[selectedWave] : [];
    if (!planningSources.tierWaves || !selectedWave || !cards.length || !/^t[0-4]$/.test(tier)) {
      prescriptions.push({ groupId: group.id, tier, status: "unavailable", cards: [] });
      groupPlanning[group.id] = composeGroupPlanning({ group, sources: planningSources, wave: null, prior });
      continue;
    }
    try {
      const progressionVerified = false;
      // Resolve curriculum-card IDs through the existing canonical skill-family map.
      // Mapping identifies the evidence to look up; it does not certify mastery.
      let cardFamilyMap = {};
      if (discipline === "wrestling") {
        const { WRESTLING_CARD_FAMILIES } = await import("/coaches/cards/wrestling/family-map.js");
        const journeyKey = String(group.journey || "").toLowerCase() === "z2h" ? "r2c" : "p2l";
        cardFamilyMap = WRESTLING_CARD_FAMILIES?.[journeyKey]?.[tier] || {};
      }
      const mappedCards = cards.map(card => ({
        ...card,
        familyId: cardFamilyMap[String(card.id || "").toLowerCase()] || "",
        groupId: group.id,
        groupLabel: group.label || group.id
      }));
      prescriptions.push({
        groupId: group.id, tier, waveKey: selectedWave,
        status: "ready",
        contentState: "accepted",
        progressionStatus: "unverified",
        progressionVerified,
        mappingStatus: mappedCards.every(card => card.familyId) ? "mapped" : "incomplete",
        cards: mappedCards
      });
      groupPlanning[group.id] = composeGroupPlanning({
        group,
        sources: planningSources,
        wave: { waveKey: selectedWave, cards: mappedCards },
        prior
      });
    } catch (error) {
      console.warn("Group curriculum unavailable", group.id, error);
      prescriptions.push({ groupId: group.id, tier, status: "unavailable", cards: [] });
      groupPlanning[group.id] = composeGroupPlanning({ group, sources: planningSources, wave: null, prior });
    }
  }
  return {
    ...payload,
    planningSources: normalizePlanningSources(planningSources, "hybrid"),
    groupPlanning,
    groupPrescriptions: prescriptions,
    acceptedLessonContent: Object.fromEntries(Object.entries(groupPlanning).map(([groupId, planning]) => [groupId, acceptedCardsForGroup(planning)]))
  };
}

function persistSession(payload) {
  try {
    const previous = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    const sameRoute = String(previous?.journey || "") === String(payload?.journey || "")
      && String(previous?.discipline || "") === String(payload?.discipline || "");
    if (sameRoute && (previous?.tier || previous?.week)) {
      localStorage.setItem("sandman_previous_route_context_v1", JSON.stringify({
        journey: previous.journey || "",
        discipline: previous.discipline || "",
        tier: previous.tier || "",
        rankLabel: previous.rankLabel || "",
        week: previous.week || ""
      }));
    }
  } catch {}

  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(CLIPBOARD_KEY);
  localStorage.removeItem("sandman_secondary_session_v1");
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  writeCompatibilityKeys(payload);
}

async function openCanonicalPractice(payload) {
  await requireCoach();
  const entry = practiceEntryIntent();
  const historical = String(entry.mode || "") === "after-the-fact";

  if (historical) {
    // Production's canonical recovery endpoint is still running the older
    // program/location policy. Historical reconstruction does not need that
    // endpoint: create an isolated dated practice with openPracticeSession.
    // Use a history-only liveSessionId so this can never replace today's room pointer.
    const historicalSessionId = [
      "history",
      String(payload.sessionDateKey || "").replace(/[^0-9-]/g, ""),
      String(payload.sessionId || "").replace(/[^a-z0-9._:-]/gi, "-")
    ].filter(Boolean).join("-");

    const openHistorical = httpsCallable(functions, "openPracticeSession");
    const response = await openHistorical({
      liveSessionId: historicalSessionId,
      locationId: payload.locationId,
      academyId: payload.locationId,
      roomId: payload.roomId,
      sessionDateKey: payload.sessionDateKey,
      discipline: payload.discipline,
      journey: "",
      program: "attendance-routed",
      track: "",
      tier: payload.tier || "",
      week: payload.week || "",
      schema: payload.schema,
      executionMode: payload.executionMode,
      durationMinutes: payload.durationMinutes
    });

    const practiceId = String(response.data?.practiceId || "").trim();
    if (!practiceId) throw new Error("Historical practice identity was not returned.");

    activePracticeId = practiceId;
    return {
      ...payload,
      practiceId,
      sessionId: historicalSessionId,
      program: "attendance-routed",
      journey: "",
      entryMode: "after-the-fact",
      source: "historical-session-builder"
    };
  }

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
    durationMinutes: payload.durationMinutes,
    ...(payload.sessionDateKey ? { sessionDateKey: payload.sessionDateKey } : {})
  });
  const practiceId = String(response.data?.practiceId || "").trim();
  if (!practiceId) throw new Error("Practice identity was not returned.");
  activePracticeId = practiceId;
  sessionStorage.removeItem(PRACTICE_ENTRY_KEY);
  return { ...payload, practiceId };
}

async function restoreCanonicalPractice(practiceId) {
  await requireCoach();
  showPrePracticeSetup();
  const getPractice = httpsCallable(functions, "getPracticeSession");
  const response = await getPractice({ practiceId });
  const practice = response.data?.practice || {};
  if (String(practice.status || "").toLowerCase() !== "active") throw new Error("This practice is no longer active.");
  const practiceLocation = String(practice.locationId || practice.academyId || "");
  const practiceRoomId = String(practice.roomId || "");
  const room = SESSION_ROOMS.find((candidate) =>
    candidate.locationId === practiceLocation
      && candidate.roomId === practiceRoomId
  ) || SESSION_ROOMS.find((candidate) =>
    ["mat-1a", "mat-1b"].includes(practiceRoomId)
      && candidate.locationId === practiceLocation
      && candidate.roomId === "mat-1"
  );
  if (!room) throw new Error("The practice room is not available in Session Builder.");
  activePracticeId = String(practiceId || "");
  populateRooms(room.value);
  const restoredDiscipline = String(practice.discipline || "").toLowerCase();
  const preferredDiscipline = restoredDiscipline === "unassigned" ? "" : restoredDiscipline;
  updateDisciplineAvailability(preferredDiscipline);
  const rememberedSession = readJson(SESSION_KEY, {});
  const rememberedFilter = String(rememberedSession?.practiceId || "") === String(practiceId || "")
    ? String(rememberedSession?.attendanceJourneyFilter || "")
    : "";
  populateJourneys(rememberedFilter);
  populatePrograms(String(practice.program || ""));
  setShell(String(practice.schema || "academy-60"));
  selectedMode = normalizeExecutionMode(practice.executionMode, "manual");
  planningSources = normalizePlanningSources(rememberedSession.planningSources || DEFAULT_HYBRID_PLANNING_SOURCES, selectedMode);
  groupPlanningDraft = rememberedSession.groupPlanning || {};
  planningSourceInputs.forEach(input => {
    input.checked = Boolean(planningSources[input.dataset.planningSource]);
  });
  populateRanks(String(practice.tier || ""));
  if (weekSelect && practice.week && [...weekSelect.options].some((option) => option.value === String(practice.week))) {
    weekSelect.value = String(practice.week);
  }
  refreshFocusSuggestion({ apply: false });
  roomSelect.disabled = true;
  await refreshHybridAvailability();
  showPracticeContext();
  document.getElementById("dashboardNotice").textContent = "Practice route restored. Continue with the same practice.";
  document.getElementById("dashboardNotice").hidden = false;
}

continueToContextBtn?.addEventListener("click", showPracticeContext);
backToGuidedSetupBtn?.addEventListener("click", () => {
  if (practiceContextScreen) practiceContextScreen.hidden = true;
  if (currentSessionSection) currentSessionSection.hidden = true;
  if (guidedSetupScreen) guidedSetupScreen.hidden = false;
});

journeySelect?.addEventListener("change", () => {
  updateSummary();
});

sessionTypeButtons.forEach(button => button.addEventListener("click", () => {
  selectedSessionType = button.dataset.sessionType || "academy";
  selectedDuration = SESSION_TYPES[selectedSessionType]?.defaultMinutes || 60;
  renderDurationChoices();
  updateSummary();
}));

modeButtons.forEach(button => button.addEventListener("click", () => {
  selectedMode = button.dataset.mode || "hybrid";
  refreshFocusSuggestion();
  updateModeButtons();
  updateConditionalControls();
  updateSummary();
}));

planningSourceInputs.forEach(input => input.addEventListener("change", () => {
  planningSources = readPlanningSources();
  renderHybridPlanning();
  updateSummary();
}));

roomSelect.addEventListener("change", () => {
  const preferredDiscipline = disciplineFamilySelect?.value || "";
  const preferredJourney = journeySelect?.value || "";
  updateDisciplineAvailability(preferredDiscipline);
  populateJourneys(preferredJourney);
  populatePrograms(disciplineSelect.value);
  populateRanks(rankSelect?.value || "");
  refreshHybridAvailability();
});

disciplineFamilySelect?.addEventListener("change", () => {
  populateJourneys("");
  populatePrograms("");
  populateRanks();
  populateWeeks();
  refreshFocusSuggestion();
  refreshHybridAvailability();
});

disciplineSelect.addEventListener("change", () => {
  const program = selectedProgram();
  if (program && journeySelect) journeySelect.value = program.journey;
  if (program && disciplineFamilySelect) disciplineFamilySelect.value = program.discipline;
  populateRanks();
  refreshHybridAvailability();
});
rankSelect?.addEventListener("change", refreshHybridAvailability);
weekSelect?.addEventListener("change", updateSummary);

document.getElementById("discardDraftBtn")?.addEventListener("click", () => {
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
  const buildError = document.getElementById("buildError");
  if (buildError) {
    buildError.hidden = true;
    buildError.textContent = "";
  }
  buildBtn.disabled = true;
  buildBtn.textContent = "Opening practice…";
  try {
    // Session entry is NOT AUTO lesson authorization. Attendance must happen
    // first; no browser-produced group prescription can authorize AUTO.
    // Defer all AUTO decisions until canonical checked-in groups and verified
    // server evidence are available. Keep the eventual execution gate closed.
    if (selectedMode === "auto") {
      payload = { ...payload, groupPrescriptions: [], autoPendingVerification: true };
    } else {
      payload = await resolveGroupPrescriptions(payload);
    }
    payload = await openCanonicalPractice(payload);
    persistSession(payload);

    const historical = String(practiceEntryIntent().mode || "") === "after-the-fact";
    const reviewingHybridPlan = selectedMode === "hybrid" && new URLSearchParams(window.location.search).get("planning") === "1";
    const attendanceFirstId = sessionStorage.getItem("sandman_attendance_first_practice_id");
    if (historical) {
      sessionStorage.removeItem(PRACTICE_ENTRY_KEY);
      window.location.href = `/coaches/attendance/session.html?practiceId=${encodeURIComponent(payload.practiceId)}&session=${encodeURIComponent(payload.sessionId)}&return=historical&flow=builder`;
    } else if (reviewingHybridPlan || attendanceFirstId === payload.practiceId) {
      sessionStorage.removeItem("sandman_attendance_first_practice_id");
      window.location.href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(payload.sessionId)}&practiceId=${encodeURIComponent(payload.practiceId)}`;
    } else {
      window.location.href = `/coaches/attendance/session.html?practiceId=${encodeURIComponent(payload.practiceId)}&session=${encodeURIComponent(payload.sessionId)}&return=clipboard&flow=builder`;
    }
  } catch (error) {
    console.error("Session entry failed", error);
    const noticeEl = document.getElementById("dashboardNotice");
    const message = error?.message || "Could not start this session.";
    noticeEl.textContent = message;
    noticeEl.hidden = false;
    if (buildError) {
      buildError.textContent = message;
      buildError.hidden = false;
      buildError.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    buildBtn.disabled = false;
    buildBtn.textContent = "Continue to Attendance";
  }
});

populateRooms();
updateDisciplineAvailability();
populateJourneys();
populatePrograms();
populateWeeks();
populateRanks();
refreshFocusSuggestion();
renderDurationChoices();
updateModeButtons();
updateConditionalControls();
renderDraft();

const searchParams = new URLSearchParams(window.location.search);
const notice = searchParams.get("notice");
if (searchParams.get("from") === "practice-entry") {
  const entry = practiceEntryIntent();
  const noticeEl = document.getElementById("dashboardNotice");
  const dateLabel = entry.sessionDateKey ? new Date(entry.sessionDateKey + "T12:00:00").toLocaleDateString() : "";
  const historical = String(entry.mode || "") === "after-the-fact";
  noticeEl.textContent = dateLabel
    ? historical
      ? `Recording past practice for ${dateLabel}. Reconstruct the session.`
      : `Practice started for ${dateLabel}. Build the session.`
    : historical
      ? "Recording past practice. Reconstruct the session."
      : "Practice started. Build the session.";
  noticeEl.hidden = false;
  // Practice Operations already chose the planned lane, so do not show a
  // second start/skip decision here.
  showPrePracticeSetup();
}
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
