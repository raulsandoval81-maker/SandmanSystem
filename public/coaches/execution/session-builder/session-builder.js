import {
  LADDER_YOUTH,
  LADDER_F4,
  LADDER_Q2M
} from "/assets/js/ladder.service.js";

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

const HYBRID_MODEL_PREFIXES = Object.freeze({
  "youth-z2h-wrestling": "/assets/js/hybrid/youth/youth-zero-to-hero-wrestling",
  "teen-p2l-wrestling": "/assets/js/hybrid/teen/teen-path-to-legend-wrestling",
  "teen-p2l-boxing": "/assets/js/hybrid/teen/teen-path-to-legend-boxing",
  "adult-q2m-mma": "/assets/js/hybrid/adult/adult-quest-to-mastery-mma"
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

function programUsesRank() {
  return Boolean(selectedProgramOption()?.dataset.journey && RANK_LADDERS[selectedProgramOption().dataset.journey]);
}

function programUsesWeek() {
  return programUsesRank() && selectedMode === "hybrid" && hybridUsable;
}

function isManualOnlyProgram() {
  return ["manual-build", "fitness-striking"].includes(disciplineSelect?.value || "") || selectedSchema === "fitness-striking-60";
}

function tierFromLadderKey(key = "") {
  return String(key).replace(/^R/i, "T");
}

function populateRanks(preferredTier = "") {
  const journey = selectedProgramOption()?.dataset.journey || "";
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
  const prefix = HYBRID_MODEL_PREFIXES[disciplineSelect?.value || ""];
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
    selectedMode = "manual";
    modeWasForced = true;
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

  if (!hybridUsable) {
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
  modeField.hidden = manualOnly;
  modeAvailability.hidden = manualOnly;

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
  const option = selectedProgramOption();
  const tier = programUsesRank() ? rankSelect.value : "";
  const journey = option?.dataset.journey || "";
  const ladder = RANK_LADDERS[journey] || [];
  const rankName = ladder.find(rank => tierFromLadderKey(rank.key) === tier)?.name || "";

  return {
    program: disciplineSelect?.value || "",
    foundry: option?.dataset.foundry || "",
    track: option?.dataset.track || "",
    journey,
    discipline: option?.dataset.discipline || "",
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
  document.getElementById("summaryMode").textContent = selectedMode === "hybrid" ? "Hybrid" : "Manual";

  if (isManualOnlyProgram()) {
    summaryAvailability.textContent = "Manual session shell.";
  } else if (hybridUsable) {
    summaryAvailability.textContent = selectedMode === "hybrid" ? "Hybrid suggestions will be added in Clipboard." : "Manual planning selected; no Hybrid suggestions will be added.";
  } else if (disciplineSelect?.value) {
    summaryAvailability.textContent = "Hybrid suggestions are not available for this program and rank. Manual planning will be used.";
  } else {
    summaryAvailability.textContent = "Choose a program to check Hybrid availability.";
  }

  buildBtn.disabled = !program.program;
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

shellCards.forEach(card => card.addEventListener("click", () => {
  shellCards.forEach(item => {
    const active = item === card;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  selectedSchema = card.dataset.schema || "standard-60";
  if (selectedSchema === "fitness-striking-60") {
    disciplineSelect.value = "fitness-striking";
    populateRanks();
  }
  refreshHybridAvailability();
}));

modeButtons.forEach(button => button.addEventListener("click", () => {
  if (button.disabled) return;
  selectedMode = button.dataset.mode || "manual";
  modeWasForced = false;
  updateModeButtons();
  updateConditionalControls();
  updateSummary();
}));

roomSelect.addEventListener("change", updateSummary);
disciplineSelect.addEventListener("change", () => {
  if (disciplineSelect.value === "fitness-striking") {
    selectedSchema = "fitness-striking-60";
    shellCards.forEach(card => {
      const active = card.dataset.schema === selectedSchema;
      card.classList.toggle("active", active);
      card.setAttribute("aria-pressed", String(active));
    });
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

buildBtn.addEventListener("click", () => {
  const existingDraft = getRecoverableDraft();
  if (existingDraft && !window.confirm("Starting a new session will replace the unfinished Clipboard draft. Continue?")) return;

  const program = getProgramData();
  if (!program.program) return;
  const shell = shellData();
  const sessionId = roomSelect.value || "lompoc-mat-1";
  const parts = sessionId.split("-");
  const week = programUsesWeek() ? weekSelect.value : "";
  const hybrid = getHybridData(week);
  const payload = {
    schema: selectedSchema,
    durationMinutes: shell.minutes,
    xpTimeScale: shell.minutes >= 120 ? "two-hour" : shell.minutes >= 90 ? "ninety-minute" : "standard",
    executionMode: selectedMode,
    sessionId,
    academyId: parts[0] || "lompoc",
    roomId: parts.slice(1).join("-") || "mat-1",
    ...program,
    rank: program.tier,
    week,
    ...hybrid,
    source: "session-builder",
    createdAt: new Date().toISOString()
  };

  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(CLIPBOARD_KEY);
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  writeCompatibilityKeys(payload);
  window.location.href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(sessionId)}`;
});

populateWeeks();
populateRanks();
renderDraft();

const notice = new URLSearchParams(window.location.search).get("notice");
if (notice === "choose-session") {
  const noticeEl = document.getElementById("dashboardNotice");
  noticeEl.textContent = "Choose a session shell first.";
  noticeEl.hidden = false;
}

refreshHybridAvailability();
