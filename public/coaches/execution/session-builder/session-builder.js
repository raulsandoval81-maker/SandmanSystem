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

  "adult-q2m-mma-t0":
    "/assets/js/hybrid/adult/adult-quest-to-mastery-mma-t0-waves.js",

  "teen-p2l-boxing-t0":
    "/assets/js/hybrid/teen/teen-path-to-legend-boxing-t0-waves.js"
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

const SCHEMA_ONLY_CLASSES = [
  "kickboxing-60"
];

// Session Builder owns the planned session duration.
// Attendance preserves it; Daily Grind uses it to select
// the appropriate coach-award range.
const SESSION_DURATION_MINUTES = Object.freeze({
  "quick-45": 45,
  "standard-60": 60,
  "kickboxing-60": 60,
  "extended-90": 90,
  "full-90": 90,
  "standard-90": 90,
  "extended-120": 120,
  "full-120": 120,
  "standard-120": 120
});

function durationMinutesForSchema(schema = "") {
  const key = String(schema || "")
    .trim()
    .toLowerCase();

  if (SESSION_DURATION_MINUTES[key]) {
    return SESSION_DURATION_MINUTES[key];
  }

  // Compatibility fallback:
  // accepts schema values such as custom-45, practice-90, etc.
  const match = key.match(/(?:^|[-_])(45|60|90|120)(?:$|[-_])/);

  if (match) {
    return Number(match[1]);
  }

  return 60;
}

const RANK_LABELS = {
  Z2H: {
    T0: "Shadow",
    T1: "Recruit",
    T2: "Contender",
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
    T0: "Apprentice",
    T1: "Warrior",
    T2: "Champion",
    T3: "Veteran",
    T4: "Mastery"
  },

};

function populateRanks() {
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
    opt.textContent = "Select Program First";

    rankSelect.appendChild(opt);
    return;
  }

  Object.entries(ranks).forEach(([tier, label]) => {
    const opt =
      document.createElement("option");

    opt.value = tier;
    opt.textContent = `${tier} — ${label}`;

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

function setActive(list, activeEl) {
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

    if (selectedMode === "manual") {
      disciplineSelect.value = "manual-build";

      if (weekSelect) {
        weekSelect.value = "manual";
      }

      populateRanks();
    }
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

function getProgramData() {
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
function getManualProgramData() {
  return {
    program: "manual-build",
    foundry: "Manual",
    track: "Manual Build",
    journey: "Manual",
    discipline: "Coach Built",
    tier: "",
    rankLabel: "Manual Build"
  };
}

function getCycleData() {
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
      console.warn(
        "Combat hybrid model missing, using default:",
        modelKey,
        err
      );
    }
  }

  const weekStructure =
    model.WEEK_STRUCTURE || ["teach", "drill", "live"];

  const phase =
    weekStructure[(weekNumber - 1) % weekStructure.length] ||
    "teach";

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

function getEmptyHybridData() {
  return {
    hybridPhase: "",
    hybridCycle: "",
    hybridWeekInCycle: "",
    hybridWaveKey: "",
    hybridWave: [],
    hybridCards: [],
    hybridRules: {}
  };
}

function getRoomData(sessionId) {
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
  selectedMode === "manual"
    ? getManualProgramData()
    : getProgramData();

  const cycleData =
    getCycleData();

  const isSchemaOnly =
    SCHEMA_ONLY_CLASSES.includes(selectedSchema);

const requiresProgram =
  selectedMode !== "manual" &&
  !isSchemaOnly;

if (requiresProgram && !programData.program) {
  alert("Select a program first.");
  return;
}

const shouldLoadHybrid =
  selectedMode === "hybrid" &&
  !isSchemaOnly;

const hybridData =
  shouldLoadHybrid
    ? await getHybridData(programData, cycleData)
    : getEmptyHybridData();

  const roomData =
    getRoomData(selectedSessionId);

  const durationMinutes =
    durationMinutesForSchema(selectedSchema);

  const payload = {
    schema:
      selectedSchema,

    durationMinutes:
      durationMinutes,

    xpTimeScale:
      durationMinutes >= 120
        ? "two-hour"
        : durationMinutes >= 90
          ? "ninety-minute"
          : "standard",

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
    "sandman_session_duration_minutes",
    String(durationMinutes)
  );

  localStorage.setItem(
    "sandman_xp_time_scale",
    durationMinutes >= 120
      ? "two-hour"
      : durationMinutes >= 90
        ? "ninety-minute"
        : "standard"
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
    "sandman_hybrid_cards",
    JSON.stringify(hybridData.hybridCards)
  );

  window.location.href =
    `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(selectedSessionId)}`;
});