import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { CULTURE_LESSONS } from "/coaches/culture/culture-lessons.js";
import { reconcileCheckedInGroups } from "/coaches/execution/session-builder/attendance-evidence-bridge.js";
import { executableCardsForBlock } from "/coaches/execution/session-builder/hybrid-planning-policy.js";
import {
  INNER_DRILL_CONTRACT_VERSION,
  WRESTLING_LIVE_FORMATS,
  createInnerDrill,
  overrideInnerDrillTiming,
  toClipboardDrillBlock,
  validateInnerDrillBlock
} from "/assets/js/practice/shared-inner-drill-contract.js";


import {
  escapeHtml,
  getAutoDesc,
  makeClipCard
} from "../engine/clipboard/card-engine.js";

import {
  clearSlotCards,
  clearClipboardSlots,
  getSlotLimit,
  appendCardToSlot
} from "../engine/clipboard/slot-engine.js";


import {
  getBlockCards,
  getStoredClipboardCards,
  dedupeClipboardCards
} from "../engine/clipboard/clipboard-storage.js";

const RETURN_TO_KEY = "sandman_return_to";
const ALL_IN_ONE_RETURN = "/coaches/execution/clipboard-2.0/";
/* =========================
   DEBUG / AUTH
========================= */

window.addEventListener("error", (e) => {
  console.error("🔥 JS ERROR:", e.message, e.filename, e.lineno);

  const el = document.getElementById("saveStatus");
  if (el) el.textContent = "JS ERROR: " + e.message;
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("🔥 PROMISE ERROR:", e.reason);

  const el = document.getElementById("saveStatus");
  if (el) {
    el.textContent =
      "PROMISE ERROR: " + (e.reason?.message || e.reason);
  }
});

let authReady = false;
let currentUser = null;

ensureSignedIn()
  .then((user) => {
    console.log("✅ auth ready", user.uid);
    currentUser = user;
    authReady = true;
  })
  .catch((err) => {
    console.error("auth error", err);
  });

/* =========================
   SESSION KEYS
========================= */

const SESSION_KEY = "sandman_session_builder_v1";
const SESSION_PARAM = String(new URLSearchParams(window.location.search).get("session") || "").trim();
const CLIPBOARD_KEY = "sandman_clipboard_v1";
const DRAFT_KEY = "sandman_clipboard_draft_v1";
const COACH_SESSION_KEY = "sandman_coach_session_v1";
const BIG_CLOCK_KEY = "sandman_big_clock_payload_v2";
const LAST_PRACTICE_KEY = "sandman_last_practice_payload";

function matLaneLabel() {
  return "Mat 1";
}

function getSessionPayload() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
  } catch {
    return {};
  }
}

function renderLaneIdentity() {
  const session = getSessionPayload();
  const lane = document.getElementById("clipboardMatLane");
  if (lane) lane.textContent = matLaneLabel(session);

  const back = document.querySelector(".back-builder-link");
  if (back && session.practiceId) {
    const sessionId = session.sessionId || SESSION_PARAM || "";
    const sessionPart = sessionId ? `&session=${encodeURIComponent(sessionId)}` : "";
    back.href = `/coaches/execution/session-builder/?practiceId=${encodeURIComponent(session.practiceId)}${sessionPart}`;
  }
}

renderLaneIdentity();

function getDraftPayload() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return draft && draft.version === 1 ? draft : null;
  } catch {
    return null;
  }
}

function isRecoverableDraft(draft) {
  return Boolean(draft && ["editing", "launched"].includes(draft.lifecycle));
}

/* =========================
   SCHEMAS
========================= */

const SCHEMAS = {
  "quick-45": {
    mode: "single",
    label: "Combat Quick 45",
    maxMinutes: 45,
    focusModes: {
      "warmup-only": [
        { key: "warmup", label: "Warm-up", minutes: 45 }
      ],
      "conditioning": [
        { key: "warmup", label: "Warm-up", minutes: 5 },
        { key: "cond", label: "Conditioning", minutes: 40 }
      ],
      "technique": [
        { key: "warmup", label: "Warm-up", minutes: 5 },
        { key: "technique", label: "Technique", minutes: 40 }
      ],
      "drilling": [
        { key: "warmup", label: "Warm-up", minutes: 5 },
        { key: "drills", label: "Drilling", minutes: 40 }
      ],
      "live": [
        { key: "warmup", label: "Warm-up", minutes: 5 },
        { key: "live", label: "Live Session", minutes: 40 }
      ]
    }
  },

  "standard-60": {
    mode: "board",
    label: "Combat Standard 60",
    maxMinutes: 60,
    blocks: [
      { key: "onmat", label: "Announcements / On The Mat Talk", minutes: 2 },
      { key: "warmup", label: "Warm Up / Body Mechanics", minutes: 8 },
      { key: "drills", label: "Review of Prior Week’s Skills", minutes: 10 },
      { key: "technique", label: "Introduction of New Techniques", minutes: 15 },
      { key: "water", label: "Water Break", minutes: 2 },
      { key: "live", label: "Live Session", minutes: 15 },
      { key: "cond", label: "Conditioning / Skill Based Activities", minutes: 5 },
      { key: "offmat", label: "Roll Call / Off The Mat Talk", minutes: 3 }
    ]
  },

"fitness-striking-60": {
  mode: "board",
  label: "Fitness Striking 60",
  maxMinutes: 60,
  blocks: [
    {
      key: "onmat",
      label: "Arrival / Mindset",
      minutes: 3
    },
    {
      key: "warmup",
      label: "Movement & Body Mechanics",
      minutes: 8
    },
    {
      key: "drills",
      label: "Review & Reinforcement",
      minutes: 12
    },
    {
      key: "technique",
      label: "New Skill Development",
      minutes: 8
    },
    {
      key: "water",
      label: "Transition / Water",
      minutes: 3
    },
    {
      key: "live",
      label: "Self-Defense Integration",
      minutes: 12
    },
    {
      key: "cond",
      label: "Conditioning",
      minutes: 12
    },
    {
      key: "offmat",
      label: "Close",
      minutes: 2
    }
  ]
},

  "elite-90": {
    mode: "board",
    label: "Combat Elite 90",
    maxMinutes: 90,
    blocks: [
      { key: "onmat", label: "Announcements / On The Mat Talk", minutes: 2 },
      { key: "warmup", label: "Warm Up / Body Mechanics", minutes: 10 },
      { key: "drills", label: "Review of Prior Week’s Skills", minutes: 15 },
      { key: "technique", label: "Introduction of New Techniques", minutes: 20 },
      { key: "water", label: "Water Break + Mat Games", minutes: 5 },
      { key: "live", label: "Live Session", minutes: 25 },
      { key: "cond", label: "Conditioning / Skill Based Activities", minutes: 10 },
      { key: "offmat", label: "Roll Call / Off The Mat Talk", minutes: 3 }
    ]
  },

  "extended-120": {
    mode: "board",
    label: "Combat Extended 120",
    maxMinutes: 120,
    blocks: [
      { key: "onmat", label: "Announcements / On The Mat Talk", minutes: 3 },
      { key: "warmup", label: "Warm Up / Body Mechanics", minutes: 12 },
      { key: "drills", label: "Review of Prior Week’s Skills", minutes: 20 },
      { key: "technique", label: "Introduction of New Techniques", minutes: 25 },
      { key: "water", label: "Water Break + Mat Games", minutes: 5 },
      { key: "live", label: "Live Session", minutes: 35 },
      { key: "cond", label: "Conditioning / Skill Based Activities", minutes: 15 },
      { key: "offmat", label: "Roll Call / Off The Mat Talk", minutes: 5 }
    ]
  }
};

function makePrivateSchema(minutes) {
  const warmup = Math.min(5, minutes);
  const focus = Math.max(0, minutes - warmup);
  return {
    mode: "single",
    label: `Private Session ${minutes}`,
    maxMinutes: minutes,
    focusModes: {
      "warmup-only": [
        { key: "warmup", label: "Warm-up / Movement", minutes }
      ],
      "conditioning": [
        { key: "warmup", label: "Warm-up", minutes: warmup },
        { key: "cond", label: "Conditioning", minutes: focus }
      ],
      "technique": [
        { key: "warmup", label: "Warm-up", minutes: warmup },
        { key: "technique", label: "Technique", minutes: focus }
      ],
      "drilling": [
        { key: "warmup", label: "Warm-up", minutes: warmup },
        { key: "drills", label: "Drilling", minutes: focus }
      ],
      "live": [
        { key: "warmup", label: "Warm-up", minutes: warmup },
        { key: "live", label: "Live Session", minutes: focus }
      ]
    }
  };
}

SCHEMAS["private-30"] = makePrivateSchema(30);
SCHEMAS["private-45"] = makePrivateSchema(45);
SCHEMAS["private-60"] = makePrivateSchema(60);
SCHEMAS["private-90"] = makePrivateSchema(90);

SCHEMAS["academy-60"] = {
  ...SCHEMAS["standard-60"],
  label: "Academy Class 60"
};

SCHEMAS["academy-75"] = {
  mode: "board",
  label: "Academy Class 75",
  maxMinutes: 75,
  blocks: [
    { key: "onmat", label: "Announcements / On The Mat Talk", minutes: 2 },
    { key: "warmup", label: "Warm Up / Body Mechanics", minutes: 10 },
    { key: "drills", label: "Review of Prior Skills", minutes: 12 },
    { key: "technique", label: "New Technique", minutes: 18 },
    { key: "water", label: "Water Break", minutes: 3 },
    { key: "live", label: "Live Session", minutes: 20 },
    { key: "cond", label: "Conditioning / Skill Activity", minutes: 7 },
    { key: "offmat", label: "Roll Call / Off The Mat Talk", minutes: 3 }
  ]
};

SCHEMAS["academy-90"] = {
  ...SCHEMAS["elite-90"],
  label: "Academy Class 90"
};

SCHEMAS["academy-120"] = {
  ...SCHEMAS["extended-120"],
  label: "Academy Class 120"
};

const BLOCK_KEYS = [
  "onmat",
  "warmup",
  "drills",
  "technique",
  "water",
  "live",
  "cond",
  "offmat"
];

const DRILL_BLOCK_SLOTS = Object.freeze([
  "warmup",
  "drills",
  "technique",
  "live",
  "cond"
]);

const CUE_LEVELS = Object.freeze([
  "minimal",
  "optimal",
  "maximum"
]);

const FLOW_CUE_PRESETS = Object.freeze([
  "Position",
  "Go",
  "Next position",
  "Reset",
  "Switch",
  "Partner change",
  "5 sec",
  "10 sec",
  "Time",
  "Hold",
  "Ready",
  "Live",
  "Recover",
  "Water"
]);
const SLOT_TIMER_PACKS = {
  warmup: [
    {
      pack: "Warm-Up Timers",
      preset: "wu_shadow_ss",
      label: "Shadow Slow / Slow"
    },
    {
      pack: "Warm-Up Timers",
      preset: "wu_shadow_ff",
      label: "Shadow Fast / Fast"
    }
  ],

  drills: [
    {
      pack: "Drill Timers (Old Moves)",
      preset: "dr_easy_no",
      label: "Easy In / No Finish"
    },
    {
      pack: "Drill Timers (Old Moves)",
      preset: "dr_easy_easy",
      label: "Easy In / Easy Finish"
    },
    {
      pack: "Drill Timers (Old Moves)",
      preset: "dr_easy_hard",
      label: "Easy In / Hard Finish"
    },
    {
      pack: "Drill Timers (Old Moves)",
      preset: "dr_hard_easy",
      label: "Hard In / Easy Finish"
    },
    {
      pack: "Drill Timers (Old Moves)",
      preset: "dr_hard_hard",
      label: "Hard In / Hard Finish"
    }
  ],

  technique: [
    {
      pack: "Technique Timers (New Moves)",
      preset: "tech_partner_2",
      label: "Partner Drill 2:00"
    }
  ],

  live: [
    {
      pack: "Live Timers (Situations)",
      preset: "lv_beg_neu_15x8",
      label: "Neutral 15s x 8"
    },
    {
      pack: "Live Timers (Situations)",
      preset: "lv_beg_bot_20x6",
      label: "Bottom 20s x 6"
    }
  ],

  cond: [
    {
      pack: "Conditioning Timers",
      preset: "cond_tabata_20_10",
      label: "Tabata 20/10"
    },
    {
      pack: "Conditioning Timers",
      preset: "cond_hiit_30_30x8",
      label: "HIIT 30/30"
    }
  ]
};

const blockEls = {
  onmat: document.getElementById("block-onmat"),
  warmup: document.getElementById("block-warmup"),
  drills: document.getElementById("block-drills"),
  technique: document.getElementById("block-technique"),
  water: document.getElementById("block-water"),
  live: document.getElementById("block-live"),
  cond: document.getElementById("block-cond"),
  offmat: document.getElementById("block-offmat")
};

/* =========================
   STATE
========================= */

const storedDraft = getDraftPayload();
let builderSession = getSessionPayload();
let shouldRedirectToBuilder = false;

if (!SCHEMAS[builderSession.schema] && isRecoverableDraft(storedDraft) && storedDraft.session) {
  builderSession = storedDraft.session;
  localStorage.setItem(SESSION_KEY, JSON.stringify(builderSession));
}

if (!SCHEMAS[builderSession.schema] && !isRecoverableDraft(storedDraft)) {
  shouldRedirectToBuilder = true;
  window.location.replace("/coaches/execution/session-builder/?notice=choose-session");
}

let groupEvidenceDiagnostics = {};

// Reconcile locally assembled groups against the server-owned attendance
// roster before offering any group lesson. This does NOT approve progression.
if (["auto", "hybrid"].includes(String(builderSession.executionMode || "").toLowerCase())
    && builderSession.practiceId && !shouldRedirectToBuilder) {
  try {
    await ensureSignedIn();
    const verifyPractice = httpsCallable(functions, "getPracticeSession");
    const result = await verifyPractice({ practiceId: builderSession.practiceId });
    if (String(result.data?.practice?.status || "").toLowerCase() !== "active") {
      throw new Error("Practice is no longer active.");
    }
    const attendanceSnap = await getDoc(doc(db, "attendance_sessions", builderSession.practiceId));
    if (!attendanceSnap.exists()) throw new Error("No canonical attendance record was found.");
    const attendance = attendanceSnap.data() || {};
    const check = reconcileCheckedInGroups(
      builderSession.trainingGroups, attendance.checkedInIds
    );
    if (!check.ok) throw new Error(check.reason);
    builderSession = {
      ...builderSession, attendanceRosterVerified: true,
      attendanceCheckedInCount: check.checkedInCount,
      autoPendingVerification: String(builderSession.executionMode).toLowerCase() === "auto"
    };
  } catch (error) {
    console.warn("[clipboard] Canonical attendance check failed", error);
    builderSession = {
      ...builderSession, attendanceRosterVerified: false,
      groupPrescriptions: [],
      autoPendingVerification: true
    };
    const status = document.getElementById("saveStatus");
    if (status) status.textContent = "Attendance verification needed: " +
      (error?.message || "Return to Attendance.");
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(builderSession));
}

// Read-only, server-authorized diagnostics. The returned preview explicitly
// forbids AUTO authorization; no client result is turned into a prescription.
if (builderSession.attendanceRosterVerified === true
    && ["auto", "hybrid"].includes(String(builderSession.executionMode || "").toLowerCase())
    && String(builderSession.discipline || "").toLowerCase() === "wrestling") {
  try {
    const { WRESTLING_CARD_FAMILIES } = await import("/coaches/cards/wrestling/family-map.js");
    const preview = httpsCallable(functions, "skillCheckCoachCall");
    for (const group of builderSession.trainingGroups || []) {
      const ids = Array.isArray(group.athleteIds) ? group.athleteIds.map(String) : [];
      const journey = String(group.journey || "").toLowerCase();
      const tier = String(group.tier || "").toLowerCase();
      const key = ["z2h", "r2c"].includes(journey) ? "r2c" : journey === "p2l" ? "p2l" : "";
      const familyIds = [...new Set(Object.values(WRESTLING_CARD_FAMILIES?.[key]?.[tier] || {}))].slice(0, 50);
      if (!ids.length || ids.length > 30 || !familyIds.length) {
        groupEvidenceDiagnostics[group.id] = "Evidence preview unavailable: group or curriculum mapping incomplete.";
        continue;
      }
      try {
        const result = (await preview({
          action: "preview-group-lessons",
          athleteId: ids[0], athleteIds: ids, discipline: "wrestling", familyIds
        })).data || {};
        const blockers = [...new Set([...(result.blockers || []),
          ...(result.supervisedSuggestion?.blockers || [])])];
        groupEvidenceDiagnostics[group.id] = blockers.length
          ? "Evidence review required: " + blockers.slice(0, 4).join(", ")
          : "Evidence preview received. Coach review required; AUTO prescription is not authorized.";
      } catch (error) {
        const code = String(error?.code || "unknown").replace("functions/", "");
        const message = String(error?.message || "Server verification failed.");
        // A rejected diagnostic preview is not a failed session or permission to
        // bypass verified evidence. Surface the actionable backend reason.
        console.warn("[clipboard] Group evidence preview rejected", {
          groupId: group.id, code, message, details: error?.details || null
        });
        groupEvidenceDiagnostics[group.id] =
          "Evidence preview unavailable (" + code + "): " + message +
          ". AUTO lesson selection remains unverified.";
      }
    }
  } catch (error) {
    console.warn("[clipboard] Group evidence diagnostics unavailable", error);
  }
}

const week =
  localStorage.getItem("sandman_week");

const phase =
  localStorage.getItem("sandman_hybrid_phase");

const waveKey =
  localStorage.getItem("sandman_hybrid_wave_key");

  const hybridCards =
  JSON.parse(localStorage.getItem("sandman_hybrid_cards") || "[]");

const rankLabel =
  localStorage.getItem("sandman_rank_label");

const journeyLabel =
  localStorage.getItem("sandman_journey");

const disciplineLabel =
  localStorage.getItem("sandman_discipline");

const tierLabel =
  localStorage.getItem("sandman_tier");

let currentSchema =
  SCHEMAS[builderSession.schema]
    ? builderSession.schema
    : localStorage.getItem("sandman_clipboard_schema") || "quick-45";

if (!SCHEMAS[currentSchema]) {
  currentSchema = "quick-45";
}
const totalTimeEl = document.getElementById("totalTime");
const saveStatusEl = document.getElementById("saveStatus");

const singleFocusWrap =
  document.getElementById("quickFocusWrap") ||
  document.getElementById("singleFocusWrap");

const singleFocusEl = document.getElementById("singleFocus");
const clipboardBankEl = document.getElementById("clipboard-bank");

/* =========================
   BASIC HELPERS
========================= */

function setStatus(message) {
  if (saveStatusEl) {
    saveStatusEl.textContent = message;
  }
}

function getActiveSession() {
  builderSession = getSessionPayload();

  return {
    schema: currentSchema,
    executionMode: builderSession.executionMode || "",
    practiceId: builderSession.practiceId || "",
    sessionId: builderSession.sessionId || "lompoc-mat-1",
    academyId: builderSession.academyId || "lompoc",
    roomId: builderSession.roomId || "mat-1",
    program: builderSession.program || "",
    track: builderSession.track || "",
    journey: builderSession.journey || "",
    discipline: String(builderSession.discipline || "").toLowerCase(),
    tier: String(builderSession.tier || "").trim(),
    week: String(builderSession.week || "").trim(),
    trainingGroups: Array.isArray(builderSession.trainingGroups) ? builderSession.trainingGroups : [],
    planningSources: builderSession.planningSources || {},
    groupPlanning: builderSession.groupPlanning || {},
    acceptedLessonContent: builderSession.acceptedLessonContent || {},
    carryForwardNote: String(builderSession.carryForwardNote || "").trim()
  };
}

function groupJourneyDisplay(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "Z2H") return "Road2Champion";
  if (key === "P2L") return "Path2Legend";
  if (key === "Q2M") return "Quest2Mastery";
  return String(value || "").trim();
}

function renderClipboardTrainingGroups() {
  const el = document.getElementById("clipboardTrainingGroups");
  const disclosure = document.getElementById("clipboardTrainingGroupsDisclosure");
  const summary = document.getElementById("clipboardTrainingGroupsSummary");
  if (!el || !disclosure || !summary) return;

  const session = getActiveSession();
  const groups = Array.isArray(session.trainingGroups) ? session.trainingGroups : [];
  const prescriptions = Array.isArray(builderSession.groupPrescriptions) ? builderSession.groupPrescriptions : [];
  if (!groups.length) {
    disclosure.hidden = true;
    el.innerHTML = "";
    return;
  }

  disclosure.hidden = false;
  const athleteCount = new Set(groups.flatMap(group => Array.isArray(group.athleteIds) ? group.athleteIds.map(String) : [])).size;
  summary.textContent = `Training Groups (${groups.length}) · ${athleteCount} athletes · View details`;
  el.innerHTML = groups.map((group, index) => {
    const tier = String(group.tier || "").toUpperCase();
    const note = String(group.carryForwardNote || "").trim();
    const names = Array.isArray(group.athleteNames) && group.athleteNames.length
      ? group.athleteNames.join(", ")
      : "";
    const progressionLabel = String(group.progressionTierLabel || group.progressionTier || "Tier Unverified");
    const individualTiers = Array.isArray(group.roster)
      ? group.roster.map((athlete) => `${athlete.athleteName || athlete.athleteId}: ${athlete.tier || "unverified"}`).join(" · ")
      : "";
    const prescription = prescriptions.find(item => item.groupId === group.id);
    const planning = session.groupPlanning?.[group.id] || {};
    const encodeText = (value) => String(value || "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
    const mode = String(session.executionMode || "").toLowerCase();
    const teachingLinks = mode === "manual" ? "" : prescription?.status === "ready"
      ? prescription.cards.map(card => {
          // Only link to local teaching pages. Never turn imported curriculum metadata
          // into an arbitrary navigation target.
          const href = String(card.href || "");
          const safeHref = href.startsWith("/coaches/cards/") && href.endsWith(".html") && !href.includes("..") && !href.includes("?") && !href.includes("#") ? href : "";
          return safeHref
            ? `<a href="${encodeText(safeHref)}" target="_blank" rel="noopener noreferrer">${encodeText(card.title || "Skill card")}</a>`
            : `<span>${encodeText(card.title || "Skill card")} (link unavailable)</span>`;
        }).join(" · ")
      : "Lesson mapping requires review";
    return `
      <article class="clipboard-group-chip" data-tier="${tier}">
        <span class="clipboard-group-label">Mat 1 · Group ${index + 1}</span>
        <strong>${String(group.ageGroup || "Athletes").replace(/^Youth(?:\s+7\s*[–-]\s*10)?$/i, "Youth").replace(/^Teen(?:\s*14\s*\+)?$/i, "Teen")} · ${groupJourneyDisplay(group.journey)} · ${encodeText(progressionLabel)}</strong>
        <span>Instructional focus: ${tier ? `${encodeText(tier)} ${encodeText(group.rank || "")}` : "Not confirmed"}</span>
        <span>${names ? names : "System-guided group"}</span>
        ${individualTiers ? `<small>${encodeText(individualTiers)}</small>` : ""}
        ${note ? `<em>Carry forward: ${note}</em>` : ""}
        ${planning.systemSuggestion ? `<em>System suggestion: ${encodeText(planning.systemSuggestion.reason || planning.systemSuggestion.state)}</em>` : ""}
        ${planning.coachInput?.currentNote ? `<em>Coach plan: ${encodeText(planning.coachInput.currentNote)}</em>` : ""}
      ${groupEvidenceDiagnostics[group.id] ? `<div class="clipboard-group-skills">${encodeText(groupEvidenceDiagnostics[group.id])}</div>` : ""}
        ${teachingLinks ? `<div class="clipboard-group-skills">${teachingLinks}</div>` : ""}
        ${mode === "hybrid" && prescription?.status === "ready" ? `<label>Coach lesson adjustments<textarea class="clipboard-group-lesson-notes" data-group-id="${encodeText(String(group.id || ""))}" aria-label="Coach adjustments for group ${index + 1}" rows="3" placeholder="Add, replace, or modify this group’s lesson and teaching cues"></textarea></label>` : ""}
      </article>
    `;
  }).join("");
}


const HYBRID_WAVE_PREFIXES = {
  Z2H: "/assets/js/hybrid/youth/youth-zero-to-hero-wrestling",
  P2L: "/assets/js/hybrid/teen/teen-path-to-legend-wrestling"
};
const clipboardWaveModels = new Map();
function saveClipboardPlanning() {
  localStorage.setItem(SESSION_KEY, JSON.stringify(builderSession));
  queueDraftSave();
}
async function clipboardWavesForGroup(group) {
  if (String(builderSession.discipline || "").toLowerCase() !== "wrestling") return {};
  const journey = String(group.journey || "").toUpperCase();
  const prefix = HYBRID_WAVE_PREFIXES[journey];
  if (!prefix) return {};
  // T0 is a browsing fallback, never a progression or Coach-confirmed tier.
  const tier = /^t[0-4]$/i.test(String(group.tier || "")) ? String(group.tier).toLowerCase() : "t0";
  const key = prefix + "-" + tier;
  if (!clipboardWaveModels.has(key)) {
    clipboardWaveModels.set(key, import(key + "-waves.js").catch(() => null));
  }
  const legacy = await clipboardWaveModels.get(key);
  if (journey !== "Z2H") return legacy?.WAVE_CARDS || {};
  try {
    const policy = await import("/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-policy.js");
    return policy.resolveRoad2ChampionWrestlingTierWaves(tier)?.waves || legacy?.WAVE_CARDS || {};
  } catch { return legacy?.WAVE_CARDS || {}; }
}
function renderWaveBlockPlacements() {
  document.querySelectorAll(".clipboard-wave-placements").forEach(el => el.remove());
  const prescriptions = Array.isArray(builderSession.groupPrescriptions) ? builderSession.groupPrescriptions : [];
  const placements = builderSession.clipboardWavePlacements || {};
  for (const block of document.querySelectorAll("#planBlocks .plan-block")) {
    const slot = block.dataset.slot || "";
    if (!/^(drills|technique|live|onmat)$/.test(slot)) continue;
    const entries = prescriptions.flatMap(p => (p.status === "ready" ? p.cards || [] : [])
      .filter(card => placements[p.groupId]?.[String(card.id || card.cardId || card.title || "")] === slot)
      .map(card => ({groupId:p.groupId,title:card.title || card.id || "Skill"})));
    if (!entries.length) continue;
    const box = document.createElement("div");
    box.className = "clipboard-wave-placements";
    const heading = document.createElement("strong");
    heading.textContent = "HYBRID · Coach-approved group work";
    box.append(heading);
    for (const entry of entries) {
      const item = document.createElement("p");
      item.textContent = entry.groupId + " · " + entry.title;
      box.append(item);
    }
    block.append(box);
  }
}
async function initClipboardHybridPlanning() {
  const panel = document.getElementById("clipboardHybridPlanning");
  const waveCheck = document.getElementById("clipboardTierWaves");
  const coachCheck = document.getElementById("clipboardCoachInput");
  const container = document.getElementById("clipboardWaveGroups");
  if (!panel || !waveCheck || !coachCheck || !container) return;
  if (String(builderSession.executionMode || "").toLowerCase() !== "hybrid") return;
  panel.hidden = false;
  const existingSources = builderSession.planningSources || {};
  builderSession.planningSources = {
    tierWaves: existingSources.tierWaves === true,
    systemSuggestions: false,
    coachInput: existingSources.coachInput === true
  };
  waveCheck.checked = builderSession.planningSources.tierWaves;
  coachCheck.checked = builderSession.planningSources.coachInput;
  const groups = builderSession.trainingGroups || [];
  const models = await Promise.all(groups.map(group => clipboardWavesForGroup(group)));
  function updatePrescriptions() {
    const prescriptions = groups.map((group,index) => {
      const selected = builderSession.clipboardWaveSelections?.[group.id] || "";
      const cards = waveCheck.checked && selected && Array.isArray(models[index]?.[selected])
        ? models[index][selected].map(card => ({...card, groupId:group.id,groupLabel:group.label || group.id})) : [];
      return {
        groupId:group.id, tier:String(group.tier || ""), waveKey:selected,
        status:cards.length ? "ready" : "unavailable",
        contentState:cards.length ? "accepted" : "unavailable",
        progressionVerified:false, progressionStatus:"unverified",
        cards
      };
    });
    builderSession.groupPrescriptions = prescriptions;
    builderSession.groupPlanning = Object.fromEntries(prescriptions.map(p => [p.groupId, {
      ...(builderSession.groupPlanning?.[p.groupId] || {}),
      sources:builderSession.planningSources,
      tierWave:p.status === "ready" ? {
        waveKey:p.waveKey, cards:p.cards, state:"accepted", progressionVerified:false,
        provenance:"approved-tier-wave"
      } : null
    }]));
    builderSession.acceptedLessonContent = Object.fromEntries(prescriptions.map(p => [p.groupId,p.cards]));
    saveClipboardPlanning();
    renderWaveBlockPlacements();
  }
  function render() {
    container.replaceChildren();
    if (coachCheck.checked) {
      const info = document.createElement("p");
      info.className = "muted";
      info.textContent = "Coach carry-forward notes remain available in Training Groups.";
      container.append(info);
    }
    if (!waveCheck.checked) { updatePrescriptions(); return; }
    groups.forEach((group,index) => {
      const section = document.createElement("section");
      section.className = "clipboard-hybrid-group";
      const title = document.createElement("strong");
      title.textContent = (group.label || "Group " + (index+1)) + " · " + String(group.journey || "");
      section.append(title);
      const waves = models[index] || {};
      const waveSelect = document.createElement("select");
      waveSelect.setAttribute("aria-label","Wave for "+(group.label || group.id));
      const empty = new Option("Select shared principle / Wave","");waveSelect.add(empty);
      Object.entries(waves).filter(([,cards])=>Array.isArray(cards)&&cards.length).forEach(([key]) =>
        waveSelect.add(new Option(key.replaceAll("_"," "),key)));
      waveSelect.value = builderSession.clipboardWaveSelections?.[group.id] || "";
      section.append(waveSelect);
      if (!waveSelect.options.length || waveSelect.options.length === 1) {
        const warn = document.createElement("p");warn.className="muted";
        warn.textContent="Wave catalog unavailable for this group; manual instruction remains available.";
        section.append(warn);
      }
      waveSelect.addEventListener("change",() => {
        builderSession.clipboardWaveSelections ||= {};
        builderSession.clipboardWaveSelections[group.id] = waveSelect.value;
        builderSession.clipboardWavePlacements ||= {};
        builderSession.clipboardWavePlacements[group.id] = {};
        updatePrescriptions();render();
      });
      const selectedCards = Array.isArray(waves[waveSelect.value]) ? waves[waveSelect.value] : [];
      if (selectedCards.length) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = selectedCards.length + " approved curriculum cards · choose lesson blocks";
        details.append(summary);
        for (const card of selectedCards) {
          const row = document.createElement("label");row.className="clipboard-wave-card-row";
          const name = document.createElement("span");name.textContent=card.title || card.id;
          const select = document.createElement("select");
          select.setAttribute("aria-label","Lesson block for "+(card.title || card.id));
          [["","Not placed"],["drills","Previous Skills / Drills"],["technique","New Techniques"],["live","Live Session"],["onmat","On-Mat Talk"]].forEach(([value,label])=>select.add(new Option(label,value)));
          const id = String(card.id || card.cardId || card.title || "");
          select.value=builderSession.clipboardWavePlacements?.[group.id]?.[id] || "";
          select.addEventListener("change",()=>{
            builderSession.clipboardWavePlacements ||= {};
            builderSession.clipboardWavePlacements[group.id] ||= {};
            builderSession.clipboardWavePlacements[group.id][id]=select.value;
            saveClipboardPlanning();renderWaveBlockPlacements();
          });
          row.append(name,select);details.append(row);
        }
        section.append(details);
      }
      container.append(section);
    });
    updatePrescriptions();
  }
  waveCheck.addEventListener("change",()=>{builderSession.planningSources.tierWaves=waveCheck.checked;render();});
  coachCheck.addEventListener("change",()=>{builderSession.planningSources.coachInput=coachCheck.checked;render();});
  render();
}

let draftSaveTimer = null;

function drillBlockId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `drill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCueLevel(value = "optimal") {
  const level = String(value || "").trim().toLowerCase();
  return CUE_LEVELS.includes(level) ? level : "optimal";
}

function legacyDrillBlock(item) {
  return {
    id: item.dataset.drillId || drillBlockId(),
    name: item.querySelector(".drill-name")?.value.trim() || "",
    minutes: Math.max(0, Number(item.querySelector(".drill-minutes")?.value || 0)),
    goal: item.querySelector(".drill-goal")?.value.trim() || "",
    cueLevel: normalizeCueLevel(item.querySelector(".drill-cue-level")?.value),
    coachingCues: item.querySelector(".drill-coaching-cues")?.value.trim() || "",
    flowCues: item.querySelector(".drill-flow-cues")?.value.trim() || ""
  };
}

function splitCues(value = "") {
  return String(value).split("·").map(cue => cue.trim()).filter(Boolean);
}

function timingFromEditor(item) {
  const type = item.querySelector(".inner-drill-timing-type")?.value || "none";
  if (type === "none") return null;
  if (type === "continuous") return {
    type, seconds: Number(item.querySelector(".inner-drill-continuous-seconds")?.value)
  };
  if (type === "match") return {
    type, periodSeconds: String(item.querySelector(".inner-drill-periods")?.value || "")
      .split(",").map(value => Number(value.trim())),
    periodBreakSeconds: Number(item.querySelector(".inner-drill-period-break")?.value),
    matchCount: Number(item.querySelector(".inner-drill-match-count")?.value),
    recoverySeconds: Number(item.querySelector(".inner-drill-match-recovery")?.value),
    shortTimeSeconds: Number(item.querySelector(".inner-drill-short-time")?.value)
  };
  const rotation = item.querySelector(".inner-drill-rotation")?.value || "standard";
  const common = {
    workSeconds: Number(item.querySelector(".inner-drill-work")?.value),
    restSeconds: Number(item.querySelector(".inner-drill-rest")?.value)
  };
  return type === "live" && rotation !== "standard"
    ? {type:"rotation", format:rotation, athleteCount:Number(item.querySelector(".inner-drill-athletes")?.value), ...common}
    : {type:"interval", rounds:Number(item.querySelector(".inner-drill-rounds")?.value), ...common};
}

function sessionPlanningMode() {
  const mode = String(getActiveSession().executionMode || "manual").toLowerCase();
  return ["auto","hybrid","manual"].includes(mode) ? mode : "manual";
}

function compileDrillBlock(block, item) {
  const legacy = legacyDrillBlock(item);
  const timer = timingFromEditor(item);
  if (!timer) return legacy;
  const source = item._innerDrillSource || null;
  if (source && source.contractVersion !== INNER_DRILL_CONTRACT_VERSION) {
    throw new TypeError("unsupported-inner-drill-contract");
  }
  const input = {
    id:legacy.id, name:legacy.name, kind:item.querySelector(".inner-drill-timing-type")?.value === "continuous"
      ? "drill" : item.querySelector(".inner-drill-timing-type")?.value,
    parentBlock:block?.dataset.slot || item.dataset.parentBlock || "", discipline:getActiveSession().discipline || "wrestling",
    practiceMode:source?.practiceMode || sessionPlanningMode(), origin:source?.origin || "coach",
    skillFamily:source?.skillFamily || null, coachCard:source?.coachCard || null,
    assignedGroupIds:source?.assignedGroupIds || [],
    instructionalPurpose:source?.instructionalPurpose || legacy.goal || "Coach-selected practice activity",
    goal:legacy.goal, cueLevel:legacy.cueLevel, coachingCues:splitCues(legacy.coachingCues),
    flowCues:splitCues(legacy.flowCues), timer,
    recommendationProvenance:source?.recommendationProvenance || null,
    skillProvenance:source?.skillProvenance || null, policyHook:source?.policyHook || null
  };
  let compiled = createInnerDrill(input);
  if (source && JSON.stringify(timer) !== JSON.stringify(source.timer)) {
    compiled = overrideInnerDrillTiming({...source,...input}, timer);
  } else if (source?.originalProposal) {
    compiled = Object.freeze({...compiled,originalProposal:source.originalProposal,coachOverride:source.coachOverride===true});
  }
  return {...toClipboardDrillBlock(compiled), innerDrill:compiled};
}

function captureDrillBlocks(block) {
  return [...block.querySelectorAll(".drill-subblock")].map(item => compileDrillBlock(block,item));
}

function coachInnerDrillMessage(error) {
  const message = String(error?.message || error || "Invalid inner-drill timing.");
  return message.replace(/^parent-block-capacity-exceeded:.*/, "Scheduled drill time exceeds this parent block.")
    .replace(/^parent-block-reservation-exceeded:.*/, "Whole-minute drill reservations exceed this parent block.")
    .replace(/^parent-timer-conflicts-with-inner-schedule.*/, "Remove the parent Block Timer or use continuous inner drills; two interval schedules cannot run together.")
    .replace(/^unsupported-inner-drill-contract.*/, "This drill uses an unsupported timing contract.");
}

function validateClipboardInnerDrills({forExecution = false} = {}) {
  const errors = [];
  document.querySelectorAll("#planBlocks .plan-block:not(.hidden)").forEach(block => {
    let drills = [];
    try {
      drills = captureDrillBlocks(block).map(item => item.innerDrill).filter(Boolean);
    } catch (error) {
      errors.push(`${block.dataset.slot}: ${coachInnerDrillMessage(error)}`);
      return;
    }
    if (!drills.length) return;
    const validation = validateInnerDrillBlock({parentMinutes:Number(block.dataset.minutes || 0),
      parentTimer:{pack:block.dataset.timerPack || ""},drills});
    validation.blockers.forEach(blocker => errors.push(`${block.dataset.slot}: ${coachInnerDrillMessage(blocker)}`));
    if (forExecution && drills.some(drill => drill.origin === "server-suggestion"
        && drill.recommendationProvenance?.previewOnly === true)) {
      errors.push(`${block.dataset.slot}: Preview-only recommendations cannot enter practice execution.`);
    }
  });
  return {ok:errors.length === 0, errors};
}

function requireValidInnerDrills(options = {}) {
  const validation = validateClipboardInnerDrills(options);
  document.querySelectorAll(".inner-drill-error").forEach(element => element.textContent = "");
  if (!validation.ok) {
    setStatus(`Fix Drill Block timing: ${validation.errors.join(" ")}`);
    const first = document.querySelector(".inner-drill-error");
    if (first) first.textContent = validation.errors.join(" ");
  }
  return validation.ok;
}

function captureDraftBlocks() {
  return [...document.querySelectorAll("#planBlocks .plan-block")].map(block => ({
    slot: block.dataset.slot || "",
    minutes: Number(block.dataset.minutes || 0),
    visible: !block.classList.contains("hidden"),
    notes: document.getElementById(`notes-${block.dataset.slot}`)?.value || "",
    drillBlocks: captureDrillBlocks(block),
    timer: {
      pack: block.dataset.timerPack || "",
      preset: block.dataset.timerPreset || "",
      label: block.dataset.timerLabel || ""
    }
  }));
}

function persistDraft(lifecycle = "editing") {
  if (!requireValidInnerDrills()) return null;
  const previous = getDraftPayload() || {};
  const session = {
    ...getActiveSession(),
    ...builderSession,
    schema: currentSchema
  };

  const draft = {
    version: 1,
    lifecycle,
    schema: currentSchema,
    durationMinutes: Number(builderSession.durationMinutes || getSchemaMaxMinutes(currentSchema) || 0),
    session,
    focus: document.getElementById("slot-note")?.value || "",
    blocks: captureDraftBlocks(),
    flexibleOrder: [...document.querySelectorAll("#swappable > .plan-block")].map(block => block.dataset.slot || ""),
    cards: getStoredClipboardCards(CLIPBOARD_KEY),
    groupLessonAdjustments: Object.fromEntries([...document.querySelectorAll(".clipboard-group-lesson-notes")].map(field => [field.dataset.groupId, field.value])),
    updatedAt: new Date().toISOString(),
    launchedAt: lifecycle === "launched" ? new Date().toISOString() : previous.launchedAt || null,
    completedAt: lifecycle === "completed" ? new Date().toISOString() : null
  };

  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

function queueDraftSave() {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => persistDraft("editing"), 120);
}

function restoreDraft(draft) {
  if (!isRecoverableDraft(draft)) return false;

  if (localStorage.getItem(CLIPBOARD_KEY) === null && Array.isArray(draft.cards)) {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(draft.cards));
  }

  const focus = document.getElementById("slot-note");
  if (focus) focus.value = draft.focus || "";

  const swappable = document.getElementById("swappable");
  if (swappable && Array.isArray(draft.flexibleOrder)) {
    draft.flexibleOrder.forEach(slot => {
      const block = swappable.querySelector(`.plan-block[data-slot="${slot}"]`);
      if (block) swappable.appendChild(block);
    });
  }

  (Array.isArray(draft.blocks) ? draft.blocks : []).forEach(saved => {
    const block = blockEls[saved.slot];
    if (!block) return;
    showBlock(saved.slot, saved.visible !== false);
    setMinutes(saved.slot, Number(saved.minutes || 0), ["drills", "technique", "live", "cond"].includes(saved.slot));

    const notes = document.getElementById(`notes-${saved.slot}`);
    if (notes) notes.value = saved.notes || "";

    const timer = saved.timer || {};
    block.dataset.timerPack = timer.pack || "";
    block.dataset.timerPreset = timer.preset || "";
    block.dataset.timerLabel = timer.label || "";
    const select = block.querySelector(".block-timer-select");
    if (select && timer.pack) {
      select.value = `${timer.pack}|||${timer.preset || ""}|||${timer.label || ""}`;
    }

    renderSavedDrillBlocks(block, saved.drillBlocks || []);
  });

  recalcTotal();
  return true;
}

function flowCueButtons() {
  return FLOW_CUE_PRESETS.map(cue =>
    `<button type="button" class="flow-cue-chip" data-flow-cue="${escapeHtml(cue)}">${escapeHtml(cue)}</button>`
  ).join("");
}

function formatExactDuration(seconds = 0) {
  const value = Math.max(0, Number(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2,"0")}`;
}

function timingEditorValues(data = {}) {
  const inner = data.innerDrill || null;
  const timer = inner?.timer || {};
  const kind = !inner ? "none" : timer.type === "continuous" ? "continuous" : inner.kind;
  const matchingLive = Object.entries(WRESTLING_LIVE_FORMATS).find(([,format]) =>
    timer.type === "interval" && timer.workSeconds === format.workSeconds
      && timer.restSeconds === format.restSeconds && timer.rounds === format.rounds)?.[0] || "custom";
  return {inner,timer,kind,matchingLive};
}

function renderInnerDrillTiming(data = {}) {
  const {timer,kind,matchingLive} = timingEditorValues(data);
  const periods = Array.isArray(timer.periodSeconds) ? timer.periodSeconds.join(",") : "180,120,120";
  return `<details class="inner-drill-timing"${kind !== "none" ? " open" : ""}>
    <summary>Optional timing schedule <span class="inner-drill-summary">${kind === "none" ? "Not configured" : "Loading…"}</span></summary>
    <p class="inner-drill-policy">Editable training format—not an age, rank, federation, or progression policy.</p>
    <div class="inner-drill-grid">
      <label><span>Timing format</span><select class="inner-drill-timing-type">
        ${[["none","No timing schedule"],["continuous","Continuous"],["drill","Drill intervals"],["live","Live"],["match","Match"]]
          .map(([value,label])=>`<option value="${value}"${kind===value?" selected":""}>${label}</option>`).join("")}
      </select></label>
      <label data-timing-for="continuous"><span>Activity seconds</span><input class="inner-drill-continuous-seconds" type="number" min="1" max="14400" step="1" value="${Number(timer.seconds || Number(data.minutes || 5) * 60)}"></label>
      <label data-timing-for="live"><span>Live option</span><select class="inner-drill-live-format">
        ${[["custom","Custom"],...Object.entries(WRESTLING_LIVE_FORMATS).map(([value,format])=>[value,format.label])]
          .map(([value,label])=>`<option value="${value}"${matchingLive===value?" selected":""}>${label}</option>`).join("")}
      </select></label>
      <label data-timing-for="drill live"><span>Work seconds</span><input class="inner-drill-work" type="number" min="1" max="3600" step="1" value="${Number(timer.workSeconds || 30)}"></label>
      <label data-timing-for="drill live"><span>Rest / recovery</span><input class="inner-drill-rest" type="number" min="0" max="1800" step="1" value="${Number(timer.restSeconds ?? 10)}"></label>
      <label data-timing-for="drill live"><span>Rounds</span><input class="inner-drill-rounds" type="number" min="1" max="100" step="1" value="${Number(timer.rounds || 3)}"></label>
      <label data-timing-for="live"><span>Wrestling rotation</span><select class="inner-drill-rotation">
        ${[["standard","Standard partner rotation"],["top-bottom-out","Top / Bottom / Out"],["match","Match Rotation"],["ironman","Iron Man"]]
          .map(([value,label])=>`<option value="${value}"${timer.format===value?" selected":""}>${label}</option>`).join("")}
      </select></label>
      <label data-timing-for="live"><span>Rotation athletes</span><input class="inner-drill-athletes" type="number" min="3" max="5" step="1" value="${Number(timer.athleteCount || 3)}"></label>
      <label data-timing-for="match" class="inner-drill-wide"><span>Period seconds (comma-separated)</span><input class="inner-drill-periods" type="text" value="${escapeHtml(periods)}" placeholder="180,120,120"></label>
      <label data-timing-for="match"><span>Period break</span><input class="inner-drill-period-break" type="number" min="0" max="600" step="1" value="${Number(timer.periodBreakSeconds || 0)}"></label>
      <label data-timing-for="match"><span>Matches</span><input class="inner-drill-match-count" type="number" min="1" max="100" step="1" value="${Number(timer.matchCount || 1)}"></label>
      <label data-timing-for="match"><span>Between matches</span><input class="inner-drill-match-recovery" type="number" min="0" max="1800" step="1" value="${Number(timer.recoverySeconds || 60)}"></label>
      <label data-timing-for="match"><span>Short-time cue</span><input class="inner-drill-short-time" type="number" min="0" max="120" step="1" value="${Number(timer.shortTimeSeconds ?? 10)}"></label>
    </div>
    <div class="inner-drill-duration" role="status"></div>
    <div class="inner-drill-error" role="alert"></div>
  </details>`;
}

function updateInnerDrillEditor(item, {applyLivePreset = false} = {}) {
  const type = item.querySelector(".inner-drill-timing-type")?.value || "none";
  item.querySelectorAll("[data-timing-for]").forEach(field => {
    field.hidden = !String(field.dataset.timingFor || "").split(" ").includes(type);
  });
  if (type === "live" && applyLivePreset) {
    const preset = WRESTLING_LIVE_FORMATS[item.querySelector(".inner-drill-live-format")?.value];
    if (preset) {
      item.querySelector(".inner-drill-work").value = preset.workSeconds;
      item.querySelector(".inner-drill-rest").value = preset.restSeconds;
      item.querySelector(".inner-drill-rounds").value = preset.rounds;
    }
  }
  const summary = item.querySelector(".inner-drill-summary");
  const duration = item.querySelector(".inner-drill-duration");
  const error = item.querySelector(".inner-drill-error");
  const minutes = item.querySelector(".drill-minutes");
  if (minutes) minutes.readOnly = type !== "none";
  if (type === "none") {
    summary.textContent = "Not configured"; duration.textContent = ""; error.textContent = ""; return;
  }
  try {
    const block = item.closest(".plan-block");
    const compiled = compileDrillBlock(block,item).innerDrill;
    if (minutes) minutes.value = compiled.reservedMinutes;
    summary.textContent = `Total ${formatExactDuration(compiled.scheduledSeconds)}`;
    duration.innerHTML = `<strong>Scheduled: ${formatExactDuration(compiled.scheduledSeconds)}</strong>
      <span>Reserved in parent block: ${compiled.reservedMinutes} whole min</span>
      <span>${compiled.phases.length} phase${compiled.phases.length === 1 ? "" : "s"}</span>`;
    error.textContent = "";
  } catch (caught) {
    summary.textContent = "Needs attention"; duration.textContent = "";
    error.textContent = coachInnerDrillMessage(caught);
  }
}

function renderDrillSubblock(slot, data = {}) {
  const item = document.createElement("article");
  item.className = "drill-subblock";
  item.dataset.drillId = String(data.id || drillBlockId());
  item.dataset.parentBlock = slot;
  item._innerDrillSource = data.innerDrill ? JSON.parse(JSON.stringify(data.innerDrill)) : null;

  const cueLevel = normalizeCueLevel(data.cueLevel);
  const minutes = Number.isFinite(Number(data.minutes))
    ? Math.max(0, Number(data.minutes))
    : 5;

  item.innerHTML = `
    <div class="drill-subblock-head">
      <strong>Drill Block</strong>
      <div class="drill-subblock-actions">
        <button type="button" class="drill-order-btn" data-drill-move="up" aria-label="Move drill up">↑</button>
        <button type="button" class="drill-order-btn" data-drill-move="down" aria-label="Move drill down">↓</button>
        <button type="button" class="drill-remove-btn" data-drill-remove aria-label="Remove drill">Remove</button>
      </div>
    </div>

    <div class="drill-subblock-grid">
      <label>
        <span>Drill</span>
        <input class="drill-name" type="text" maxlength="80" value="${escapeHtml(data.name || "")}" placeholder="Single-leg entry">
      </label>

      <label>
        <span>Time</span>
        <input class="drill-minutes" type="number" min="0" max="60" step="1" value="${minutes}">
      </label>

      <label class="drill-goal-field">
        <span>Short goal</span>
        <input class="drill-goal" type="text" maxlength="120" value="${escapeHtml(data.goal || "")}" placeholder="Win inside position">
      </label>

      <label>
        <span>Cue level</span>
        <select class="drill-cue-level">
          <option value="minimal"${cueLevel === "minimal" ? " selected" : ""}>Minimal</option>
          <option value="optimal"${cueLevel === "optimal" ? " selected" : ""}>Optimal</option>
          <option value="maximum"${cueLevel === "maximum" ? " selected" : ""}>Maximum</option>
        </select>
      </label>
    </div>

    <details class="drill-cue-details">
      <summary>Coaching + flow cues</summary>

      <div class="drill-cue-grid">
        <label>
          <span>Coaching cues</span>
          <input class="drill-coaching-cues" type="text" maxlength="240" value="${escapeHtml(data.coachingCues || "")}" placeholder="Head up · inside position · hips in">
        </label>

        <label>
          <span>Flow cues</span>
          <input class="drill-flow-cues" type="text" maxlength="240" value="${escapeHtml(data.flowCues || "")}" placeholder="Position · Go · Next position · 5 sec">
        </label>
      </div>

      <div class="flow-cue-presets" aria-label="Quick flow cues">
        ${flowCueButtons()}
      </div>
    </details>
    ${renderInnerDrillTiming(data)}
  `;

  updateInnerDrillEditor(item);

  return item;
}

function renderSavedDrillBlocks(block, drillBlocks = []) {
  const list = block.querySelector(".drill-subblock-list");
  if (!list) return;

  list.replaceChildren();

  (Array.isArray(drillBlocks) ? drillBlocks : []).forEach(data => {
    list.appendChild(renderDrillSubblock(block.dataset.slot || "", data));
  });
}

function installDrillBlockEditors() {
  DRILL_BLOCK_SLOTS.forEach(slot => {
    const block = blockEls[slot];
    const slotEl = document.getElementById(`slot-${slot}`);
    if (!block || !slotEl || slotEl.querySelector(".drill-block-editor")) return;

    const editor = document.createElement("section");
    editor.className = "drill-block-editor";
    editor.dataset.drillEditor = slot;
    editor.innerHTML = `
      <div class="drill-block-editor-head">
        <div>
          <span class="drill-block-kicker">Within this section</span>
          <strong>Drill Blocks</strong>
        </div>

        <button type="button" class="drill-add-btn" data-add-drill-block="${slot}">
          + Drill Block
        </button>
      </div>

      <div class="drill-subblock-list"></div>
    `;

    const notes = slotEl.querySelector(".slot-notes");
    if (notes) slotEl.insertBefore(editor, notes);
    else slotEl.appendChild(editor);
  });
}

function setTitle(key, label) {
  const el = document.getElementById(`title-${key}`);
  if (el) el.textContent = label;
}

function setMinutes(key, minutes, editable = false) {
  const block = blockEls[key];
  if (!block) return;

  block.dataset.minutes = minutes;

  const input = block.querySelector(".min-input");
  const clock = block.querySelector(".mini-clock");

  if (input) {
    input.value = minutes;
    input.readOnly = !editable;
    input.min = editable ? "5" : input.min;
    input.max = editable ? "60" : input.max;
  }

  if (clock) {
    clock.textContent = `${String(minutes).padStart(2, "0")}:00`;
  }
}
function attachTimerSelectors() {
  document
    .querySelectorAll("#planBlocks .plan-block")
    .forEach(block => {
      const slot = block.dataset.slot;
      const options = SLOT_TIMER_PACKS[slot];

      block.querySelector(".timer-attach")?.remove();

      if (!options) return;

      const wrap = document.createElement("div");
      wrap.className = "timer-attach";

      wrap.innerHTML = `
        <label class="timer-label">
          Block Timer
          <select class="block-timer-select">
            <option value="">No block timer</option>

            ${options.map(opt => `
              <option value="${opt.pack}|||${opt.preset}|||${opt.label}">
                ${opt.label}
              </option>
            `).join("")}

          </select>
        </label>
      `;

      const head =
        block.querySelector(".block-head-row");

      head?.insertAdjacentElement("afterend", wrap);

      const select =
        wrap.querySelector(".block-timer-select");

      select.addEventListener("change", () => {
const [pack, preset, label] =
  select.value.split("|||");

block.dataset.timerPack = pack || "";
block.dataset.timerPreset = preset || "";
block.dataset.timerLabel = label || "";

queueDraftSave();

      });
    });
}

function showBlock(key, show) {
  blockEls[key]?.classList.toggle("hidden", !show);
}

function getSchemaMaxMinutes(schemaKey) {
  return SCHEMAS[schemaKey]?.maxMinutes || 0;
}

function recalcTotal() {
  if (!totalTimeEl) return;

  const mins = BLOCK_KEYS
    .map(k => blockEls[k])
    .filter(el => el && !el.classList.contains("hidden"))
    .reduce((sum, b) => sum + Number(b.dataset.minutes || 0), 0);

  const max = getSchemaMaxMinutes(currentSchema);
  const over = max > 0 && mins > max;
  const exact = max > 0 && mins === max;
  const state = over ? "Over" : exact ? "Exact" : "Under";

  totalTimeEl.textContent =
    `Allocated: ${Math.floor(mins)} / ${max || "—"} min · ${state}`;

  totalTimeEl.classList.toggle("over", over);
  totalTimeEl.classList.toggle("exact", exact);
  totalTimeEl.classList.toggle("under", !over && !exact);
}

function updateClipboardBankVisibility() {
  if (!clipboardBankEl) return;

  clipboardBankEl.style.display =
    SCHEMAS[currentSchema]?.mode === "single" ? "block" : "none";
}

function updateGameButtonVisibility() {
  const btn = document.getElementById("btn-add-game");
  if (!btn) return;

  const show =
    ["elite-90", "extended-120", "academy-90", "academy-120"].includes(currentSchema);

  btn.style.display = show ? "inline-block" : "none";
}

/* =========================
   TEMPLATE LOADING
========================= */

function applySingleTemplate() {
  const schema = SCHEMAS[currentSchema];
  const focus = singleFocusEl?.value || "technique";
  const blocks =
    schema.focusModes[focus] ||
    schema.focusModes["technique"];

  BLOCK_KEYS.forEach(k => showBlock(k, false));

  blocks.forEach(({ key, label, minutes }) => {
    showBlock(key, true);
    setTitle(key, label);
    setMinutes(key, minutes, false);
  });

  singleFocusWrap?.classList.remove("hidden");

  updateClipboardBankVisibility();
  recalcTotal();
  updateGameButtonVisibility();

  const focusText =
    singleFocusEl?.options?.[singleFocusEl.selectedIndex]?.text || "Focus";

  setStatus(`Loaded ${schema.label} · ${focusText}`);
}

function applyBlockTemplate(schemaKey) {
  const schema = SCHEMAS[schemaKey];

  if (!schema || !schema.blocks) {
    console.error("Schema missing or invalid:", schemaKey);
    return;
  }

  BLOCK_KEYS.forEach(k => showBlock(k, false));

  schema.blocks.forEach(({ key, label, minutes }) => {
    showBlock(key, true);
    setTitle(key, label);

    const editable =
      ["drills", "technique", "live", "cond"].includes(key);

    setMinutes(key, minutes, editable);
  });

  singleFocusWrap?.classList.add("hidden");

  updateClipboardBankVisibility();
  recalcTotal();
  updateGameButtonVisibility();

  setStatus(`Loaded ${schema.label}`);
  attachTimerSelectors();
}

window.loadCurrentSchema = function () {
  if (SCHEMAS[currentSchema]?.mode === "single") {
    applySingleTemplate();
  } else {
    applyBlockTemplate(currentSchema);
  }
};

/* =========================
   ADD CARD ROUTING
========================= */
const DISCIPLINE_CARD_ROUTES = {
  "youth-z2h-wrestling":
    "/coaches/cards/youth/z2h-wrestling/index.html",

  "youth-wrestling":
    "/coaches/cards/youth/z2h-wrestling/index.html",

  "teen-p2l-wrestling":
    "/coaches/cards/teen/p2l-wrestling/index.html",

  "teen-wrestling":
    "/coaches/cards/teen/p2l-wrestling/index.html",

  "teen-p2l-boxing":
    "/coaches/cards/teen/p2l-boxing/index.html",

  "teen-boxing":
    "/coaches/cards/teen/p2l-boxing/index.html",

  "teen-p2l-kickboxing":
    "/coaches/cards/teen/p2l-kickboxing/index.html",

  "teen-kickboxing":
    "/coaches/cards/teen/p2l-kickboxing/index.html",

  "adult-q2m-mma":
    "/coaches/cards/adult/q2m-mma/index.html",

  "adult-r2g-boxing":
    "/coaches/cards/adult/r2g-boxing/index.html"
};

window.openDisciplineCards = function () {
  const session = getActiveSession();
  const route = DISCIPLINE_CARD_ROUTES[session.program];

  if (!route) {
    setStatus("No program selected. Go back to Session Builder.");
    return;
  }

  window.location.href = route;
};

function cardMatchesSession(card) {

   if (card.source === "hybrid") {
    return true;
  }

  const session = getActiveSession();

  const sessionDiscipline =
    String(session.discipline || "")
      .trim()
      .toLowerCase();

  const cardDiscipline =
    String(card.discipline || "")
      .trim()
      .toLowerCase();

  const sessionTier =
    String(session.tier || "")
      .trim()
      .toLowerCase();

  const cardTier =
    String(card.tier || "")
      .trim()
      .toLowerCase();

  if (
    sessionDiscipline &&
    cardDiscipline &&
    cardDiscipline !== sessionDiscipline
  ) {
    return false;
  }

  if (
    sessionTier &&
    cardTier &&
    cardTier !== sessionTier
  ) {
    return false;
  }

  return true;
}

function renderClipboardList() {

  clearClipboardSlots();
const rawCards =
  dedupeClipboardCards(getStoredClipboardCards(CLIPBOARD_KEY));


const allCards =
  rawCards.filter(cardMatchesSession);



  const bankCards =
    allCards.filter(card => !card.lane);

  const bank =
    document.getElementById("clipboard-list");

  if (!allCards.length) {

    if (SCHEMAS[currentSchema]?.mode === "single" && bank) {
      bank.innerHTML =
        `<div class="muted">No cards added yet.</div>`;
    }

    return;
  }

  if (SCHEMAS[currentSchema]?.mode === "single" && bank) {

    if (!bankCards.length) {

      bank.innerHTML =
        `<div class="muted">No saved bank cards.</div>`;

    } else {

      bankCards.forEach(card => {
        bank.appendChild(makeClipCard(card));
      });

    }
  }


const LANE_MAP = {

  technique: "cards-technique",

  drill: "cards-drills",
  drills: "cards-drills",

  live: "cards-live",

  onmat: "cards-onmat",
  offmat: "cards-offmat",

  water: "cards-water",
  games: "cards-water",

  warmup: "cards-warmup-body",
  warmup_body: "cards-warmup-body",

  warmup_agility: "cards-warmup-agility",
  agility: "cards-warmup-agility",

  balance: "cards-warmup-body",

  warmup_footwork: "cards-warmup-body",
  warmup_striking_motion: "cards-warmup-body",
  warmup_reaction: "cards-warmup-agility",

  warmup_transition: "cards-warmup-body",
  warmup_movement: "cards-warmup-agility",
  warmup_live: "cards-warmup-body",

  cond: "cards-cond",
  conditioning: "cards-cond"

};

  allCards.forEach(card => {

    if (!card.lane) return;


const lane =
  String(card.lane || "")
    .trim()
    .toLowerCase();

const category =
  String(card.category || "")
    .trim()
    .toLowerCase();
if (
  (lane === "cond" || lane === "conditioning") &&
  category === "technique"
) {
  return;
}
if (
  lane === "cond" &&
  (
    card.target === "warmup_body" ||
    card.target === "warmup_agility"
  )
) {
  return;
}

    const isGame =
      category === "game" ||
      category === "games" ||
      lane === "games";

    const allowGames =
      ["elite-90", "extended-120", "academy-90", "academy-120"].includes(currentSchema) &&
      (lane === "water" || lane === "games");

    if (isGame && !allowGames) {
      return;
    }

    const slotId = LANE_MAP[lane];


    if (!slotId) return;

    const slotEl =
      document.getElementById(slotId);

    if (!slotEl) {
      console.warn("Missing slot:", slotId);
      return;
    }

    appendCardToSlot(slotEl, card);

  });

}

/* =========================
   RUN PRACTICE
========================= */

function showLockedPracticeNotice(sessionId) {
  setStatus("This practice has already started. Its saved plan is locked to protect the practice record.");
  const actions = document.querySelector(".clipboard-handoff-actions");
  if (!actions) return;
  let link = document.getElementById("resumeExistingPractice");
  if (!link) {
    link = document.createElement("a");
    link.id = "resumeExistingPractice";
    link.className = "live-link-btn primary";
    link.textContent = "Return to Existing Practice";
    actions.prepend(link);
  }
  link.href = `/coaches/execution/coach-companion/?session=${encodeURIComponent(sessionId)}`;
}

function groupActivitiesForBlock(block, session) {
  if (!["auto", "hybrid"].includes(String(session.executionMode || "").toLowerCase())) return [];
  const prescriptions = Array.isArray(builderSession.groupPrescriptions) ? builderSession.groupPrescriptions : [];
  const groups = Array.isArray(session.trainingGroups) ? session.trainingGroups : [];
  const adjustments = session.executionMode === "hybrid"
    ? Object.fromEntries([...document.querySelectorAll(".clipboard-group-lesson-notes")]
        .map(field => [field.dataset.groupId, field.value.trim()]))
    : {};
  const slot = String(block.slot || "").toLowerCase();
  // Do not prescribe a technical activity during warmup, breaks, or other unrelated blocks.
  const technical = /technique|drill|live|onmat|on-mat|skill/.test(slot);
  if (!technical) return [];
  return groups.map(group => {
    const prescription = prescriptions.find(item => String(item.groupId) === String(group.id));
    return {
      groupId: group.id,
      groupLabel: group.label || "",
      tier: group.tier || "",
      status: prescription?.status === "ready" && (prescription.cards || []).some(card => builderSession.clipboardWavePlacements?.[group.id]?.[String(card.id || card.cardId || card.title || "")] === slot) ? "ready" : "unavailable",
      waveKey: prescription?.waveKey || "",
      cards: prescription?.status === "ready" ? (prescription.cards || []).filter(card => builderSession.clipboardWavePlacements?.[group.id]?.[String(card.id || card.cardId || card.title || "")] === slot).map(card => ({
        id: card.id || "", title: card.title || "", href: card.href || "",
        familyId: card.familyId || "", discipline: card.discipline || session.discipline || ""
      })) : [],
      athleteIds: Array.isArray(group.athleteIds) ? group.athleteIds.map(String) : [],
      coachAdjustment: adjustments[group.id] || ""
    };
  });
}

window.runPractice = async function () {
  const session = getActiveSession();

  if (!requireValidInnerDrills({forExecution:true})) return;

  if (!session.discipline) {
    setStatus("Choose an explicit discipline before launching this practice.");
    return;
  }

  const blocks = [
    ...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")
  ]
.map(b => ({
  slot: b.dataset.slot,

  title:
    b.querySelector(".block-title")?.textContent?.trim() ||
    b.dataset.slot,

  minutes:
    Number(b.dataset.minutes || 0),

  cards:
    getBlockCards(b),

  notes:
    document.getElementById(`notes-${b.dataset.slot}`)
      ?.value
      .trim() || "",

  drillBlocks:
    captureDrillBlocks(b),

  timer: {
    pack:
      b.dataset.timerPack || "",

    preset:
      b.dataset.timerPreset || "",

    label:
      b.dataset.timerLabel || ""
  }
}))
.filter(b => b.minutes > 0)
.map(block => ({ ...block, groupActivities: groupActivitiesForBlock(block, session) }));

  let practiceId = String(session.practiceId || "").trim();
  try {
    const openPractice = httpsCallable(functions, "openPracticeSession");
    const opened = await openPractice({
        practiceId,
        liveSessionId: session.sessionId,
        locationId: session.locationId || session.academyId,
        academyId: session.locationId || session.academyId,
        roomId: session.roomId,
        discipline: session.discipline,
        journey: session.journey,
        program: session.program,
        track: session.track,
        tier: session.tier,
        week: session.week,
        schema: currentSchema,
        executionMode: session.executionMode,
        durationMinutes: Number(builderSession.durationMinutes || getSchemaMaxMinutes(currentSchema) || 0)
    });
    practiceId = String(opened.data?.practiceId || "").trim();
    if (!practiceId) throw new Error("Practice identity was not returned.");
    builderSession = { ...builderSession, practiceId };
    localStorage.setItem(SESSION_KEY, JSON.stringify(builderSession));
  } catch (error) {
    console.error("Practice open failed", error);
    setStatus(error?.message || "Could not open the canonical practice.");
    return;
  }

  // Do not try to rewrite the canonical plan once any execution has been recorded.
  try {
    const getPractice = httpsCallable(functions, "getPracticeSession");
    const result = await getPractice({ practiceId });
    const practice = result.data?.practice || {};
    if (practice.sessionMemory?.executionStartedAt || String(practice.status || "").toLowerCase() !== "active") {
      showLockedPracticeNotice(session.sessionId);
      return;
    }
  } catch (error) {
    console.error("Practice state check failed", error);
    setStatus("Unable to verify practice state. Nothing was launched or overwritten.");
    return;
  }

  const clockPayload = {
    source: "clipboard",
    schema: currentSchema,

    executionMode: session.executionMode,
    practiceId,
    sessionId: session.sessionId,
    academyId: session.academyId,
    roomId: session.roomId,

    program: session.program,
    track: session.track,
    discipline: session.discipline,
    journey: session.journey,
    tier: session.tier,
    week: session.week,
    trainingGroups: session.trainingGroups,
    groupPrescriptions: Array.isArray(builderSession.groupPrescriptions) ? builderSession.groupPrescriptions : [],
    planningSources: session.planningSources,
    groupPlanning: session.groupPlanning,
    acceptedLessonContent: session.acceptedLessonContent,
    groupLessonAdjustments: session.executionMode === "hybrid" ? Object.fromEntries([...document.querySelectorAll(".clipboard-group-lesson-notes")].map(field => [field.dataset.groupId, field.value])) : {},
    carryForwardNote: session.carryForwardNote,

    blocks,
    autoStart: false,
    createdAt: new Date().toISOString()
  };

  const coachSessionPayload = {
    source: "clipboard",
    schema: currentSchema,

    executionMode: session.executionMode,
    practiceId,
    sessionId: session.sessionId,
    academyId: session.academyId,
    roomId: session.roomId,

    program: session.program,
    track: session.track,
    discipline: session.discipline,
    journey: session.journey,
    tier: session.tier,
    week: session.week,
    trainingGroups: session.trainingGroups,
    groupPrescriptions: Array.isArray(builderSession.groupPrescriptions) ? builderSession.groupPrescriptions : [],
    planningSources: session.planningSources,
    groupPlanning: session.groupPlanning,
    acceptedLessonContent: session.acceptedLessonContent,
    groupLessonAdjustments: session.executionMode === "hybrid" ? Object.fromEntries([...document.querySelectorAll(".clipboard-group-lesson-notes")].map(field => [field.dataset.groupId, field.value])) : {},
    carryForwardNote: session.carryForwardNote,

    focus:
      document.getElementById("slot-note")?.value.trim() || "",

    blocks,

    updatedAt: new Date().toISOString()
  };

  try {
    const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
    const plannedCardMap = new Map();
    blocks.forEach(block => executableCardsForBlock(block).forEach((card, index) => {
      const plannedCard = {
        cardId: card.id || card.href || card.skill || card.family || `${block.slot}-${index}-${card.title}`,
        blockId: block.slot,
        title: card.title || "",
        href: card.href || "",
        skillId: card.skill || "",
        familyId: card.familyId || card.family || "",
        discipline: card.discipline || session.discipline || "",
        groupId: card.groupId || "",
        athleteIds: Array.isArray(card.athleteIds) ? card.athleteIds : []
      };
      const key = `${plannedCard.cardId}::${plannedCard.groupId}`;
      if (!plannedCardMap.has(key)) plannedCardMap.set(key, plannedCard);
    }));
    const plannedCards = [...plannedCardMap.values()];
    await saveMemory({
      operation: "plan",
      practiceId,
      planVersion: 1,
      planningContext: {
        planningSources: session.planningSources,
        groups: Object.entries(session.groupPlanning || {}).map(([groupId, planning]) => ({
          groupId,
          waveKey: planning?.tierWave?.waveKey || "",
          waveState: planning?.tierWave?.state || "",
          systemSuggestionState: planning?.systemSuggestion?.state || "",
          coachDisposition: planning?.coachInput?.disposition || "",
          originalCarryForwardNote: planning?.coachInput?.originalCarryForwardNote || "",
          currentCoachNote: planning?.coachInput?.currentNote || "",
          coachAdjustment: [...document.querySelectorAll(".clipboard-group-lesson-notes")]
            .find(field => field.dataset.groupId === groupId)?.value || ""
        }))
      },
      plannedBlocks: blocks.map(block => ({
        blockId: block.slot,
        title: block.title,
        minutes: block.minutes,
        cards: block.cards,
        drillBlocks: block.drillBlocks || []
      })),
      plannedCards
    });
  } catch (error) {
    console.error("Durable practice plan save failed", error);
    if (/practice plan cannot change after execution starts|closed practices cannot change/i.test(String(error?.message || ""))) {
      showLockedPracticeNotice(session.sessionId);
    } else {
      setStatus(error?.message || "Could not save the canonical practice plan.");
    }
    return;
  }

  localStorage.setItem(
    COACH_SESSION_KEY,
    JSON.stringify(coachSessionPayload)
  );

  localStorage.setItem(
    BIG_CLOCK_KEY,
    JSON.stringify(clockPayload)
  );

  const liveSessionPayload = {
    practiceId,
    liveSessionId: session.sessionId,
    academyId: session.academyId,
    roomId: session.roomId,

    coachUid: currentUser?.uid || "",

    status: "ready",
    currentBlockIndex: 0,

    payload: clockPayload,

    updatedAt: serverTimestamp()
  };

try {

  await setDoc(
    doc(db, "liveSessions", session.sessionId),
    liveSessionPayload,
    { merge: true }
  );

  console.log("✅ live session synced");
  persistDraft("launched");

} catch (err) {

  console.error("Live session sync failed", err);

  setStatus(
    err?.message || "Live session sync failed."
  );

  return;
}
  document.body.classList.add("run-mode");

  window.location.href =
    `/coaches/execution/big-clock-2.0/?session=${encodeURIComponent(session.sessionId)}`;
};

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#runClockBtn");
  if (!btn) return;

  if (typeof window.runPractice !== "function") {
    console.error("runPractice is not available on window");
    alert("Run Clock failed: runPractice missing");
    return;
  }

  window.runPractice();
});
/* =========================
   INTERACTION HANDLERS
========================= */

singleFocusEl?.addEventListener("change", () => {
  if (document.body.classList.contains("run-mode")) {
    setStatus("Exit run mode first.");
    return;
  }

  if (SCHEMAS[currentSchema]?.mode === "single") {
    applySingleTemplate();
    renderClipboardList();
    queueDraftSave();
  }
});

document.addEventListener("input", e => {
  const inp = e.target.closest(".min-input");
  if (!inp || inp.readOnly) return;

  const blk = inp.closest(".plan-block");

  let v = Math.max(
    5,
    Math.min(60, Number(inp.value || 5))
  );

  inp.value = v;
  blk.dataset.minutes = v;

  const clock = blk.querySelector(".mini-clock");

  if (clock) {
    clock.textContent = `${String(v).padStart(2, "0")}:00`;
  }

  recalcTotal();
  queueDraftSave();
});

document.addEventListener("click", e => {
  const mv = e.target.closest(".move-btn");
  if (!mv) return;

  const dir = mv.dataset.dir;
  const block = mv.closest(".sw");
  const parent = document.getElementById("swappable");

  if (!block || !parent || block.classList.contains("hidden")) return;

  const visibleSwBlocks = [
    ...parent.querySelectorAll(".sw:not(.hidden)")
  ];

  const idx = visibleSwBlocks.indexOf(block);

  if (idx === -1) return;

  if (dir === "up" && idx > 0) {
    parent.insertBefore(block, visibleSwBlocks[idx - 1]);
  }

  if (dir === "down" && idx < visibleSwBlocks.length - 1) {
    parent.insertBefore(visibleSwBlocks[idx + 1], block);
  }

  queueDraftSave();
});
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add-drill-block]");
  if (add) {
    const slot = add.dataset.addDrillBlock || "";
    const block = blockEls[slot];
    const list = block?.querySelector(".drill-subblock-list");
    if (!list) return;

    list.appendChild(renderDrillSubblock(slot, {
      cueLevel: "optimal",
      minutes: 5
    }));

    queueDraftSave();
    return;
  }

  const preset = e.target.closest("[data-flow-cue]");
  if (preset) {
    const drill = preset.closest(".drill-subblock");
    const input = drill?.querySelector(".drill-flow-cues");
    if (!input) return;

    const cue = preset.dataset.flowCue || "";
    const parts = input.value
      .split("·")
      .map(part => part.trim())
      .filter(Boolean);

    if (!parts.includes(cue)) parts.push(cue);

    input.value = parts.join(" · ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const remove = e.target.closest("[data-drill-remove]");
  if (remove) {
    remove.closest(".drill-subblock")?.remove();
    queueDraftSave();
    return;
  }

  const move = e.target.closest("[data-drill-move]");
  if (move) {
    const item = move.closest(".drill-subblock");
    const list = item?.parentElement;
    if (!item || !list) return;

    if (move.dataset.drillMove === "up" && item.previousElementSibling) {
      list.insertBefore(item, item.previousElementSibling);
    }

    if (move.dataset.drillMove === "down" && item.nextElementSibling) {
      list.insertBefore(item.nextElementSibling, item);
    }

    queueDraftSave();
  }
});

document.addEventListener("input", (e) => {
  const drill = e.target.closest(".drill-subblock");
  if (drill) {
    if (e.target.closest(".inner-drill-timing")) updateInnerDrillEditor(drill);
    queueDraftSave();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.matches(".drill-cue-level")) queueDraftSave();
  const drill = e.target.closest(".drill-subblock");
  if (drill && e.target.matches(".inner-drill-timing-type")) updateInnerDrillEditor(drill);
  if (drill && e.target.matches(".inner-drill-live-format")) {
    updateInnerDrillEditor(drill,{applyLivePreset:true});
  }
  if (drill && e.target.closest(".inner-drill-timing")) queueDraftSave();
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add-slot]");
  if (!btn) return;

  const slotKey = btn.dataset.addSlot;

  console.log("ADD SLOT CLICKED:", slotKey);

  localStorage.setItem(
    "sandman_pending_add_lane",
    slotKey
  );
persistDraft("editing");
localStorage.setItem(
  RETURN_TO_KEY,
  ALL_IN_ONE_RETURN
);

openDisciplineCards();
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("a.library-btn, a.clip-title-link");
  if (!link || !link.href) return;
  persistDraft("editing");
});

document.addEventListener("input", (e) => {
  if (e.target.matches("#slot-note, .slot-notes-input")) {
    queueDraftSave();
  }
});
/* =========================
   SAVE PLAN
========================= */

function getNotesValue(slotKey) {
  const el = document.getElementById(`notes-${slotKey}`);
  return el?.value.trim() || "";
}

async function saveCurrentPlanToFirestore() {
  if (!requireValidInnerDrills({forExecution:true})) {
    throw new Error("Fix Drill Block timing before saving this plan.");
  }
  const session = getActiveSession();

  const blocksDom = [
    ...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")
  ];

  const blocks = blocksDom.map(b => ({
    slot: b.dataset.slot,
    label:
      b.querySelector(".block-title")?.textContent?.trim() ||
      b.dataset.slot,
    minutes: Number(b.dataset.minutes || 0),
    text: getNotesValue(b.dataset.slot),
    cards: getBlockCards(b),
    drillBlocks: captureDrillBlocks(b)
  }));

  const totalMinutes =
    blocks.reduce((sum, b) => sum + b.minutes, 0);

  const payload = {
    source: "practice-plan",
    schema: currentSchema,

    executionMode: session.executionMode,
    sessionId: session.sessionId,
    academyId: session.academyId,
    roomId: session.roomId,

    program: session.program,
    track: session.track,
    discipline: session.discipline,
    journey: session.journey,
    tier: session.tier,
    trainingGroups: session.trainingGroups,
    groupPrescriptions: Array.isArray(builderSession.groupPrescriptions) ? builderSession.groupPrescriptions : [],
    planningSources: session.planningSources,
    groupPlanning: session.groupPlanning,
    acceptedLessonContent: session.acceptedLessonContent,
    groupLessonAdjustments: session.executionMode === "hybrid" ? Object.fromEntries([...document.querySelectorAll(".clipboard-group-lesson-notes")].map(field => [field.dataset.groupId, field.value])) : {},
    carryForwardNote: session.carryForwardNote,

    singleFocus:
      SCHEMAS[currentSchema]?.mode === "single"
        ? singleFocusEl?.value || null
        : null,

    onmat: getNotesValue("onmat"),
    warmup: getNotesValue("warmup"),
    drills: getNotesValue("drills"),
    technique: getNotesValue("technique"),
    water: getNotesValue("water"),
    live: getNotesValue("live"),
    cond: getNotesValue("cond"),
    offmat: getNotesValue("offmat"),

    note:
      document.getElementById("slot-note")?.value.trim() || "",

    blocks,
    totalMinutes,

    updatedAt: serverTimestamp()
  };

  const key = new Date().toISOString().slice(0, 10);

  await setDoc(
    doc(db, "practicePlans", key),
    payload,
    { merge: true }
  );

  return key;
}

window.savePlan = async function () {
  try {
    await saveCurrentPlanToFirestore();
    setStatus("Saved.");
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Save failed.");
  }
};
/* =========================
   CLEAR SESSION
========================= */

window.clearSession = function () {
  const ok = window.confirm("Clear this session?");
  if (!ok) return;

  localStorage.removeItem(CLIPBOARD_KEY);
  localStorage.removeItem(DRAFT_KEY);

  [
    "notes-onmat",
    "notes-warmup",
    "notes-drills",
    "notes-technique",
    "notes-water",
    "notes-live",
    "notes-cond",
    "notes-offmat"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  [
    "cards-onmat",
    "cards-warmup-body",
    "cards-warmup-agility",
    "cards-drills",
    "cards-technique",
    "cards-water",
    "cards-live",
    "cards-cond",
    "cards-offmat"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  const note = document.getElementById("slot-note");
  if (note) note.value = "";

  document.querySelectorAll(".drill-subblock").forEach(item => item.remove());

  renderClipboardList();

  setStatus("Session cleared.");
};

/* =========================
   END PRACTICE → LOG
========================= */

window.endPractice = function endPractice() {
  try {
    const session = getActiveSession();

    const blocksDom = [
      ...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")
    ];

    const blocks = blocksDom.map(b => ({
      slot: b.dataset.slot,
      label:
        b.querySelector(".block-title")?.textContent?.trim() ||
        b.dataset.slot,
      title:
        b.querySelector(".block-title")?.textContent?.trim() ||
        b.dataset.slot,
      minutes: Number(b.dataset.minutes || 0),
      notes:
        document.getElementById(`notes-${b.dataset.slot}`)
          ?.value
          .trim() || "",
      cards: getBlockCards(b),
      drillBlocks: captureDrillBlocks(b)
    }));

    const payload = {
      source: "clipboard",
      schema: currentSchema,

      executionMode: session.executionMode,
      practiceId: session.practiceId,
      sessionId: session.sessionId,
      academyId: session.academyId,
      roomId: session.roomId,

      program: session.program,
      track: session.track,
      discipline: session.discipline,
      journey: session.journey,
      tier: session.tier,

      focus:
        document.getElementById("slot-note")?.value.trim() || "",

      totalTime:
        totalTimeEl?.textContent || "",

      blocks,

      savedAt:
        new Date().toISOString()
    };

    localStorage.setItem(
      LAST_PRACTICE_KEY,
      JSON.stringify(payload)
    );

    persistDraft("completed");

    window.location.href = session.practiceId
      ? "/coaches/logs/practice-log.html?practiceId=" +
        encodeURIComponent(session.practiceId)
      : "/coaches/logs/practice-log.html";

  } catch (err) {
    console.error("End practice failed:", err);
    setStatus("Error ending practice.");
  }
};

/* =========================
   CULTURE / MAT TALK
========================= */

const MAT_TALK = {
  standards: [
    "Focus: lock in, eyes up.",
    "Effort: finish every rep.",
    "Attitude: choose how you show up.",
    "Respect: partner, coach, room."
  ],
  identity: [
    "Creed: what do we believe?",
    "Code: how do we act?",
    "Goal: what are you chasing today?",
    "Mission: why are you here?"
  ],
  system: [
    "Combat: compete in every position.",
    "Strength: physical and mental.",
    "Honor: do it right, always."
  ],
  work: [
    "Full-time work: no shortcuts.",
    "Part-time work: when you feel like it — that’s not enough."
  ],
  reflect: [
    "Did you give effort today?",
    "Did you stay focused?",
    "Did you respect your partner?",
    "Did you improve?"
  ],
  gratitude: [
    "Be grateful for your partners.",
    "Be grateful for the opportunity to train.",
    "Be grateful for the work you put in."
  ]
};

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-talk-group]");
  if (!btn) return;

  const group = btn.dataset.talkGroup;
  const items = MAT_TALK[group];

  if (!items) return;

  const box = document.getElementById("notes-onmat");
  if (!box) return;

  box.value +=
    (box.value ? "\n\n" : "") +
    items.join("\n");

  box.dispatchEvent(new Event("input"));
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-talk-group="reflect"]');
  if (!btn) return;

  const onmatBox = document.getElementById("notes-onmat");
  const offmatBox = document.getElementById("notes-offmat");

  if (!onmatBox || !offmatBox) return;

  const lines = onmatBox.value
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length);

  if (!lines.length) return;

  const questions = lines.map(line => {
    line = line.replace(/^[-•]\s*/, "");

    const cleaned =
      line.charAt(0).toLowerCase() + line.slice(1);

    return `Did you ${cleaned}?`;
  });

  offmatBox.value +=
    (offmatBox.value ? "\n\n" : "") +
    questions.join("\n");

  offmatBox.dispatchEvent(new Event("input"));
});

function getCultureLesson(id) {
  return CULTURE_LESSONS.find(lesson => lesson.id === id) || null;
}

function insertLessonIntoBox(boxId, lessonId, mode = "onmat") {
  const box = document.getElementById(boxId);
  const lesson = getCultureLesson(lessonId);

  if (!box || !lesson) return;

  const lines = [];

  if (mode === "onmat") {
    if (lesson.onmat?.line) lines.push(lesson.onmat.line);
    if (lesson.onmat?.coach) lines.push(lesson.onmat.coach);
  } else {
    if (lesson.offmat?.reflect) lines.push(lesson.offmat.reflect);
    if (lesson.offmat?.close) lines.push(lesson.offmat.close);
  }

  if (!lines.length) return;

  box.value +=
    (box.value ? "\n\n" : "") +
    lines.join("\n");

  box.dispatchEvent(new Event("input"));
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lesson-id]");
  if (!btn) return;

  const lessonId = btn.dataset.lessonId;
  const target = btn.dataset.target;
  const mode = btn.dataset.mode || "onmat";

  insertLessonIntoBox(target, lessonId, mode);
});

/* =========================
   AUTOGROW / UTILITIES
========================= */

function autoGrow(el) {
  if (!el) return;

  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("slot-notes-input")) {
    autoGrow(e.target);
  }
});

window.addEventListener("focus", () => {
  document.body.classList.remove("run-mode");
});

window.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".slot-notes-input")
    .forEach(autoGrow);

  const clockToggle = document.getElementById("clockToggle");

  clockToggle?.addEventListener("click", () => {
    document.body.classList.toggle("clock-mode");
  });
});

/* =========================
   HYBRID HELPERS
========================= */

function getHybridTargetLane(phase) {
  if (phase === "teach") return "technique";
  if (phase === "drill") return "drill";
  if (phase === "live") return "live";

  return "";
}

function getHybridTargetSlotId(phase) {
  const lane = getHybridTargetLane(phase);

  if (lane === "technique") return "cards-technique";
  if (lane === "drill") return "cards-drills";
  if (lane === "live") return "cards-live";

  return "";
}
/* =========================
   SUPPORT LIBRARIES
========================= */

const SUPPORT_PATHS = {

  grappling: {
    warmups:
      "/coaches/cards/support/grappling/warmups/index.html",

    games:
      "/coaches/cards/support/grappling/mat-games/index.html",

    conditioning:
      "/coaches/cards/support/grappling/conditioning/index.html"
  },

  striking: {
    warmups:
      "/coaches/cards/support/striking/warmups/index.html",

    games:
      "/coaches/cards/support/striking/striking-games/index.html",

    conditioning:
      "/coaches/cards/support/striking/conditioning/index.html"
  },

  mma: {
    warmups:
      "/coaches/cards/support/mma/warmups/index.html",

    games:
      "/coaches/cards/support/mma/mma-games/index.html",

    conditioning:
      "/coaches/cards/support/mma/conditioning/index.html"
  }

};

function getSupportDiscipline() {

  const session =
    getActiveSession();

  const discipline =
    String(session.discipline || "")
      .toLowerCase()
      .trim();

  if (
    discipline.includes("boxing") ||
    discipline.includes("kickboxing") ||
    discipline.includes("striking")
  ) {
    return "striking";
  }

  if (discipline.includes("mma")) {
    return "mma";
  }

  return "grappling";
}

function updateSupportLinks() {

  const discipline =
    getSupportDiscipline();

  const paths =
    SUPPORT_PATHS[discipline] ||
    SUPPORT_PATHS.grappling;

  const warmupBtn =
    document.getElementById("btn-add-warmup");

  const gameBtn =
    document.getElementById("btn-add-game");

  const conditioningBtn =
    document.getElementById("btn-add-conditioning");

  if (warmupBtn) {
    warmupBtn.href = paths.warmups;
  }

  if (gameBtn) {
    gameBtn.href = paths.games;
  }

  if (conditioningBtn) {
    conditioningBtn.href = paths.conditioning;
  }

}
/* =========================
   INIT
========================= */

(function init() {

  if (shouldRedirectToBuilder) return;

  const session = getActiveSession();

  if (SCHEMAS[session.schema]) {
    currentSchema = session.schema;
  }

  localStorage.setItem(
    "sandman_clipboard_schema",
    currentSchema
  );

  loadCurrentSchema();
  attachTimerSelectors();
  updateSupportLinks();
  renderClipboardTrainingGroups();
  void initClipboardHybridPlanning();
  document.querySelectorAll(".clipboard-group-lesson-notes").forEach(field => {
    const prior = getDraftPayload()?.groupLessonAdjustments || {};
    field.value = String(prior[field.dataset.groupId] || "");
    field.addEventListener("input", queueDraftSave);
  });
  installDrillBlockEditors();
  restoreDraft(storedDraft);

  // A practice-wide card set must not override different tier-specific group prescriptions.
  // Group teaching cards are rendered separately above. This legacy injection remains
  // available only to sessions without group prescriptions.
  const hasGroupPrescriptions = Array.isArray(builderSession.groupPrescriptions)
    && builderSession.groupPrescriptions.length > 0;
  if (!hasGroupPrescriptions &&
      String(builderSession.executionMode || "").toLowerCase() === "hybrid" &&
      Array.isArray(hybridCards) && hybridCards.length) {

    const existingCards =
      getStoredClipboardCards(CLIPBOARD_KEY)
        .filter(card => card.source !== "hybrid");

    const aggressiveFoundation =
      Number(week || 1) <= 3;

    let hybridLaneCards = [];

    if (aggressiveFoundation) {

      const SEGMENTS = [
        "drill",
        "technique",
        "live"
      ];

      hybridLaneCards =
        SEGMENTS.flatMap(lane => {

          const selected =
            hybridCards.slice(0, 3);

          return selected.map(card => ({
            ...card,
            source: "hybrid",
            lane,
            assignTo: lane
          }));

        });

    } else {

      const targetLane =
        getHybridTargetLane(phase);

      hybridLaneCards =
        hybridCards.map(card => ({
          ...card,
          lane: targetLane,
          assignTo: targetLane
        }));

    }

    const merged =
      dedupeClipboardCards([
        ...existingCards,
        ...hybridLaneCards
      ]);

    localStorage.setItem(
      CLIPBOARD_KEY,
      JSON.stringify(merged)
    );

  }

  renderClipboardList();
  persistDraft("editing");

  const hybridIdentityEl =
    document.getElementById("hybridIdentity");

  const hybridCycleEl =
    document.getElementById("hybridCycle");

if (session.executionMode === "manual" && session.program === "manual-build") {

  if (hybridIdentityEl) {
    hybridIdentityEl.textContent =
      "MANUAL BUILD";
  }

  if (hybridCycleEl) {
    hybridCycleEl.textContent =
      "Coach Built Session";
  }

} else {

  if (hybridIdentityEl) {
    const journeyDisplay = session.program === "youth-z2h-wrestling"
      ? "Road2Champion"
      : journeyLabel;
    hybridIdentityEl.textContent =
      `${journeyDisplay} ${disciplineLabel} · ${tierLabel} ${rankLabel}`;
  }

  if (hybridCycleEl) {
    hybridCycleEl.textContent = session.executionMode === "manual"
      ? "Manual planning"
      : `Week ${week} · ${phase} · ${(waveKey || "").replaceAll("_", " ")}`;
  }

}
})();
