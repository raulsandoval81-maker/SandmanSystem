const DEFAULT_COMBAT_MODEL = {

  FOUNDATIONS: [],

  SKILL_WAVES: {},

  WAVE_CARDS: {},

  WEEK_STRUCTURE: [
    "teach",
    "drill",
    "live"
  ],

  HYBRID_RULES: {
    revisitWindow: 5,
    majorReturnWeeks: 6,
    maxTravelingWaves: 2
  }

};

const COMBAT_MODEL_PATHS = {
  "youth-z2h-wrestling-t0":
    "/assets/js/hybrid/youth/youth-zero-to-hero-wrestling-t0-waves.js",

  "teen-p2l-wrestling-t0":
    "/assets/js/hybrid/teen/teen-path-to-legend-wrestling-t0-waves.js",

  "teen-p2l-boxing-t0":
    "/assets/js/hybrid/teen/teen-path-to-legend-boxing-t0-waves.js",

  "teen-p2l-kickboxing-t0":
    "/assets/js/hybrid/teen/teen-path-to-legend-kickboxing-t0-waves.js",

  "adult-q2m-mma-t1":
    "/assets/js/hybrid/adult/adult-quest-to-mastery-mma-t1-waves.js",

  "adult-r2g-boxing-t1":
    "/assets/js/hybrid/adult/adult-road-to-glory-boxing-t1-waves.js"
};

const SESSION_KEY = "sandman_session_builder_v1";

const cards = [...document.querySelectorAll(".session-card")];
const modeBtns = [...document.querySelectorAll("[data-mode]")];
const sessionBtns = [...document.querySelectorAll("[data-session-id]")];

const disciplineSelect =
  document.getElementById("disciplineSelect");

const rankSelect =
  document.getElementById("rankSelect");

const weekSelect =
  document.getElementById("weekSelect");

const buildBtn =
  document.getElementById("buildBtn");

const RANK_LABELS = {

  Z2H: {
    T0: "Shadow",
    T1: "Recruit",
    T2: "Combatant",
    T3: "Competitor",
    T4: "Warrior",
    T5: "Champion",
    T6: "Commander",
    T7: "Hero"
  },

  P2L: {
    T0: "Apprentice",
    T1: "Warrior",
    T2: "Champion",
    T3: "Veteran",
    T4: "Legend"
  },

  Q2M: {
    T1: "Apprentice",
    T2: "Warrior",
    T3: "Champion",
    T4: "Veteran",
    T5: "Master"
  },

  R2G: {
    T1: "Apprentice",
    T2: "Warrior",
    T3: "Champion",
    T4: "Veteran",
    T5: "Master"
  }

};

function populateRanks(){

  const option =
    disciplineSelect?.selectedOptions?.[0];

  const journey =
    option?.dataset.journey || "";

  const ranks =
    RANK_LABELS[journey] || {};

  rankSelect.innerHTML = "";

  if (!Object.keys(ranks).length) {

    const opt =
      document.createElement("option");

    opt.value = "";

    opt.textContent =
      "Select Program First";

    rankSelect.appendChild(opt);

    return;
  }

  Object.entries(ranks).forEach(([tier, label]) => {

    const opt =
      document.createElement("option");

    opt.value = tier;

    opt.textContent =
      `${tier} — ${label}`;

    rankSelect.appendChild(opt);

  });

}
let selectedSchema =
  document.querySelector(".session-card.active")
    ?.dataset.schema || "standard-60";

let selectedMode =
  document.querySelector("[data-mode].active")
    ?.dataset.mode || "hybrid";

let selectedSessionId =
  document.querySelector("[data-session-id].active")
    ?.dataset.sessionId || "lompoc-mat-1";

function setActive(list, activeEl){

  list.forEach(el =>
    el.classList.remove("active")
  );

  activeEl.classList.add("active");
}

cards.forEach(card => {

  card.addEventListener("click", () => {

    setActive(cards, card);

    selectedSchema =
      card.dataset.schema || "quick-45";

  });

});

modeBtns.forEach(btn => {

  btn.addEventListener("click", () => {

    setActive(modeBtns, btn);

    selectedMode =
      btn.dataset.mode || "hybrid";

  });

});

sessionBtns.forEach(btn => {

  btn.addEventListener("click", () => {

    setActive(sessionBtns, btn);

    selectedSessionId =
      btn.dataset.sessionId || "lompoc-mat-1";

  });

});

disciplineSelect?.addEventListener(
  "change",
  populateRanks
);

populateRanks();

function getProgramData(){

  const option =
    disciplineSelect?.selectedOptions?.[0];

  const selectedTier =
    rankSelect?.value ||
    option?.dataset.tier ||
    "";

  const journey =
    option?.dataset.journey || "";

  const rankLabel =
    RANK_LABELS[journey]?.[selectedTier] || "";

  return {
    program:
      disciplineSelect?.value || "",

    foundry:
      option?.dataset.foundry || "",

    track:
      option?.dataset.track || "",

    journey:
      journey,

    discipline:
      option?.dataset.discipline || "",

    tier:
      selectedTier,

    rankLabel:
      rankLabel
  };
}

function getCycleData(){

  return {
    rank:
      rankSelect?.value || "",

    week:
      weekSelect?.value || ""
  };

}

async function getHybridData(programData, cycleData) {
  const weekNumber =
    Math.max(1, Number(cycleData.week || 1));

  const modelKey =
    `${programData.program}-${String(programData.tier || "").toLowerCase()}`;

  let model =
    DEFAULT_COMBAT_MODEL;

  if (COMBAT_MODEL_PATHS[modelKey]) {
    try {
      model = await import(COMBAT_MODEL_PATHS[modelKey]);
    } catch (err) {
      console.warn("Combat hybrid model missing, using default:", modelKey, err);
    }
  }

  const weekStructure =
    model.WEEK_STRUCTURE || ["teach", "drill", "live"];

  const phase =
    weekStructure[
      (weekNumber - 1) % weekStructure.length
    ] || "teach";

  const cycleNumber =
    Math.ceil(weekNumber / 6);

  const weekInCycle =
    ((weekNumber - 1) % 6) + 1;

  const waveKeys =
    Object.keys(model.SKILL_WAVES || {});

  const waveKey =
    waveKeys[(cycleNumber - 1) % waveKeys.length] ||
    "neutral_offense";

  return {
    hybridPhase: phase,
    hybridCycle: cycleNumber,
    hybridWeekInCycle: weekInCycle,
    hybridWaveKey: waveKey,
    hybridWave: model.SKILL_WAVES?.[waveKey] || [],
    hybridCards: model.WAVE_CARDS?.[waveKey] || [],
    hybridRules: model.HYBRID_RULES || {}
  };
}
function getRoomData(sessionId){

  const parts =
    String(sessionId || "lompoc-mat-1")
      .split("-");

  const academyId =
    parts[0] || "lompoc";

  const roomId =
    parts.slice(1).join("-") || "mat-1";

  return {
    academyId,
    roomId
  };
}

  buildBtn?.addEventListener("click", async () => {
  const programData =
    getProgramData();

  const cycleData =
    getCycleData();

  const hybridData =
  await getHybridData(programData, cycleData);

    if (!programData.program) {

    alert("Select a program first.");

    return;
  }

  const roomData =
    getRoomData(selectedSessionId);

  const payload = {

    schema:
      selectedSchema,

    executionMode:
      selectedMode,

    sessionId:
      selectedSessionId,

    academyId:
      roomData.academyId,

    roomId:
      roomData.roomId,

    ...programData,
    ...cycleData,
    ...hybridData,

    source:
      "session-builder",

    createdAt:
      new Date().toISOString()
  };

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(payload)
  );

  localStorage.setItem(
    "sandman_clipboard_schema",
    selectedSchema
  );

  localStorage.setItem(
    "sandman_execution_mode",
    selectedMode
  );

  localStorage.setItem(
    "sandman_live_session_id",
    selectedSessionId
  );

  localStorage.setItem(
    "sandman_program",
    programData.program
  );

  localStorage.setItem(
    "sandman_foundry",
    programData.foundry
  );

  localStorage.setItem(
    "sandman_track",
    programData.track
  );

  localStorage.setItem(
    "sandman_journey",
    programData.journey
  );

  localStorage.setItem(
    "sandman_discipline",
    programData.discipline
  );

  localStorage.setItem(
    "sandman_tier",
    programData.tier
  );

  localStorage.setItem(
    "sandman_rank",
    cycleData.rank
  );

  localStorage.setItem(
    "sandman_rank_label",
    programData.rankLabel
  );

  localStorage.setItem(
    "sandman_week",
    cycleData.week
  );

  localStorage.setItem(
    "sandman_hybrid_phase",
    hybridData.hybridPhase
  );

  localStorage.setItem(
    "sandman_hybrid_cycle",
    hybridData.hybridCycle
  );

  localStorage.setItem(
    "sandman_hybrid_week_in_cycle",
    hybridData.hybridWeekInCycle
  );

  localStorage.setItem(
    "sandman_hybrid_wave_key",
    hybridData.hybridWaveKey
  );

  localStorage.setItem(
    "sandman_hybrid_wave",
    JSON.stringify(hybridData.hybridWave)
  );
  localStorage.setItem(
  "sandman_hybrid_wave",
  JSON.stringify(hybridData.hybridWave)
);

localStorage.setItem(
  "sandman_hybrid_cards",
  JSON.stringify(hybridData.hybridCards)
);
  window.location.href =
    `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(selectedSessionId)}`;

});