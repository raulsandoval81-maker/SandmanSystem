import {
  db,
  auth,
  ensureSignedIn,
  doc,
  setDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";
import { CULTURE_LESSONS } from "/coaches/culture/culture-lessons.js";

const RETURN_TO_KEY = "sandman_return_to";
const ALL_IN_ONE_RETURN = "/coaches/execution/all-in-one-console/";

window.addEventListener("error", (e) => {
  console.error("🔥 JS ERROR:", e.message, e.filename, e.lineno);
  const el = document.getElementById("saveStatus");
  if (el) el.textContent = "JS ERROR: " + e.message;
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("🔥 PROMISE ERROR:", e.reason);
  const el = document.getElementById("saveStatus");
  if (el) el.textContent = "PROMISE ERROR: " + (e.reason?.message || e.reason);
});
let authReady = false;
const DISCIPLINE_CARD_ROUTES = {
  "youth-z2h-wrestling": "/coaches/cards/youth/z2h-wrestling/index.html",
  "teen-p2l-wrestling": "/coaches/cards/teen/p2l-wrestling/index.html",
  "teen-p2l-boxing": "/coaches/cards/teen/p2l-boxing/index.html",
  "teen-p2l-kickboxing": "/coaches/cards/teen/p2l-kickboxing/index.html",
  "adult-q2m-mma": "/coaches/cards/adult/q2m-mma/index.html",
  "adult-r2g-boxing": "/coaches/cards/adult/r2g-boxing/index.html"
};

window.openDisciplineCards = function () {
  localStorage.setItem(
    "sandman_return_to",
    "/coaches/execution/all-in-one-console/"
  );

  const session = getCoachSessionPayload() || {};

  const program =
    session.program ||
    localStorage.getItem("sandman_program") ||
    "teen-p2l-wrestling";

  const route =
    DISCIPLINE_CARD_ROUTES[program] ||
    "/coaches/cards/";

  window.location.href = route;
};
ensureSignedIn()
  .then((user) => {
    console.log("✅ auth ready", user.uid);
    authReady = true;
  })
  .catch((err) => {
    console.error("auth error", err);
  });

const SCHEMAS = {
  "quick-45": {
    mode: "single",
    label: "Quick 45",
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
    label: "Standard 60",
    maxMinutes: 60,
    blocks: [
      { key: "onmat", label: "  Announcements / On The Mat Talk  ", minutes: 2 },
      { key: "warmup", label: "Warm Up / Body Mechanics ", minutes: 8 },
      { key: "drills", label: "Review of Prior Week’s Skills", minutes: 10 },
      { key: "technique", label: "Introduction of New Techniques", minutes: 15 },
      { key: "water", label: "Water Break", minutes: 2 },
      { key: "live", label: "Live Session", minutes: 15 },
      { key: "cond", label: "Conditioning / Skill Based Activities", minutes: 5 },
      { key: "offmat", label: "Roll Call / Off The Mat Talk ", minutes: 3 }
    ]
  },

  "elite-90": {
    mode: "board",
    label: "Elite 90",
    maxMinutes: 90,
    blocks: [
      { key: "onmat", label: "Announcements / On the mat talk", minutes: 2 },
      { key: "warmup", label: "Warm Up / Body Mechanics  ", minutes: 10 },
      { key: "drills", label: "Review of  prior week's skills", minutes: 15 },
      { key: "technique", label: "Introduction of New Techniques", minutes: 20 },
      { key: "water", label: "💧 Water Break + Mat Games", minutes: 5 },
      { key: "live", label: "Live Session", minutes: 25 },
      { key: "cond", label: " Conditioning / Skill Based Activities", minutes: 10 },
      { key: "offmat", label: "Roll Call / Off The Mat Talk", minutes: 3 }
    ]
  },

  "extended-120": {
    mode: "board",
    label: "Extended 120",
    maxMinutes: 120,
    blocks: [
      { key: "onmat", label: " Announcements / On the mat talk ", minutes: 3 },
      { key: "warmup", label: "Warm Up / Body Mechanics ", minutes: 12 },
      { key: "drills", label: "Review of  prior week's skills", minutes: 20 },
      { key: "technique", label: "Introduction of New Techniques", minutes: 25 },
      { key: "water", label: "💧 Water Break + Mat Games", minutes: 5 },
      { key: "live", label: "Live Session", minutes: 35 },
      { key: "cond", label: " Conditioning / Skill Based Activities", minutes: 15 },
      { key: "offmat", label: "Roll Call / Off The Mat Talk", minutes: 5 }
    ]
  }
};

const SLOT_RULES = {
  onmat: {
    max: 1
  },

  warmup: {
    max: 4
  },

  drills: {
    max: 4
  },

  technique: {
    max: 4
  },

  water: {
    max: 1,
    allowGamesOnlyIn: [
      "elite-90",
      "extended-120"
    ]
  },

  live: {
    max: 4
  },

  cond: {
    max: 4
  },

  offmat: {
    max: 1
  }
};

function getSlotLimit(slotKey) {
  return SLOT_RULES[slotKey]?.max || 4;
}

function gamesAllowed() {
  return [
    "elite-90",
    "extended-120"
  ].includes(currentSchema);
}


const BLOCK_KEYS = ["onmat", "warmup", "drills", "technique", "water", "live", "cond", "offmat"];

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

let currentSchema = "quick-45";

const totalTimeEl = document.getElementById("totalTime");
const saveStatusEl = document.getElementById("saveStatus");
const schemaBtns = [...document.querySelectorAll(".schema-btn")];
const singleFocusWrap = document.getElementById("singleFocusWrap");
const singleFocusEl = document.getElementById("singleFocus");
const clipboardBankEl = document.getElementById("clipboard-bank");
const COACH_SESSION_KEY = "sandman_coach_session_v1";

const inlineClockEl = document.getElementById("inlineClock");
const inlineRunStatusEl = document.getElementById("inlineRunStatus");
const inlineCurrentBlockEl = document.getElementById("inlineCurrentBlock");
const inlinePauseBtn = document.getElementById("inlinePauseBtn");
const inlineStopBtn = document.getElementById("inlineStopBtn");
const inlineRunbarEl = document.getElementById("inlineRunbar");

function setInlineRunState(state) {
  if (!inlineRunbarEl) return;

  inlineRunbarEl.classList.remove("running", "paused", "stopped");
  inlineRunbarEl.classList.add(state);

  if (inlineRunStatusEl) inlineRunStatusEl.textContent = state;
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

function showBlock(key, show) {
  blockEls[key]?.classList.toggle("hidden", !show);
}

function clearHighlights() {
  Object.values(blockEls).forEach(el => el?.classList.remove("red"));
}

function highlightBlock(key) {
  blockEls[key]?.classList.add("red");
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

  totalTimeEl.textContent = `Total: ${String(Math.floor(mins)).padStart(2, "0")}:00`;

  const max = getSchemaMaxMinutes(currentSchema);
  const over = max > 0 && mins > max;
  totalTimeEl.classList.toggle("over", over);
}

function setSchemaButtons() {
  schemaBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.schema === currentSchema);
  });
}

function updateClipboardBankVisibility() {
  if (!clipboardBankEl) return;
  clipboardBankEl.style.display = currentSchema === "quick-45" ? "block" : "none";
}

function updateGameButtonVisibility() {
  const btn = document.getElementById("btn-add-game");
  if (!btn) return;

  const show = currentSchema === "elite-90" || currentSchema === "extended-120";
  btn.style.display = show ? "inline-block" : "none";
}

function applySingleTemplate() {
  const schema = SCHEMAS["quick-45"];
  const focus = singleFocusEl.value;
  const blocks = schema.focusModes[focus] || schema.focusModes["technique"];

  BLOCK_KEYS.forEach(k => showBlock(k, false));
  clearHighlights();

  blocks.forEach(({ key, label, minutes }) => {
    showBlock(key, true);
    setTitle(key, label);
    setMinutes(key, minutes, false);
    highlightBlock(key);
  });

  singleFocusWrap.classList.remove("hidden");
  setSchemaButtons();
  updateClipboardBankVisibility();
  recalcTotal();
  updateGameButtonVisibility();

  const focusText = singleFocusEl.options[singleFocusEl.selectedIndex]?.text || "Focus";
  saveStatusEl.textContent = `Loaded ${schema.label} · ${focusText}`;
}

function applyBlockTemplate(schemaKey) {
  const schema = SCHEMAS[schemaKey];
  if (!schema || !schema.blocks) {
    console.error("Schema missing or invalid:", schemaKey);
    return;
  }

  BLOCK_KEYS.forEach(k => showBlock(k, false));
  clearHighlights();

  schema.blocks.forEach(({ key, label, minutes }) => {
    showBlock(key, true);
    setTitle(key, label);

    const editable = ["drills", "technique", "live", "cond"].includes(key);
    setMinutes(key, minutes, editable);

    if (editable) highlightBlock(key);
  });

  singleFocusWrap.classList.add("hidden");
  setSchemaButtons();
  updateClipboardBankVisibility();
  recalcTotal();
  updateGameButtonVisibility();
  saveStatusEl.textContent = `Loaded ${schema.label}`;
}
window.openDisciplineCards = function(slotKey = "technique") {

  localStorage.setItem(
    "sandman_pending_add_lane",
    slotKey
  );

  localStorage.setItem(
    "sandman_return_to",
    "/coaches/execution/all-in-one-console/"
  );

  const coachSession =
    getCoachSessionPayload();

  const program =
    coachSession?.program ||
    "teen-p2l-wrestling";

  const route =
    DISCIPLINE_CARD_ROUTES[program] ||
    "/coaches/cards/";

  window.location.href = route;
};

window.loadCurrentSchema = function () {
  if (currentSchema === "quick-45") {
    applySingleTemplate();
  } else {
    applyBlockTemplate(currentSchema);
  }
};

function setSchema(schemaKey) {
  if (INLINE_RUN.running || INLINE_RUN.paused) {
    saveStatusEl.textContent = "Stop practice before changing session type.";
    return;
  }

  if (!SCHEMAS[schemaKey]) {
    console.error("Unknown schema:", schemaKey);
    return;
  }

  currentSchema = schemaKey;
  localStorage.setItem("sandman_clipboard_schema", schemaKey);
  loadCurrentSchema();
  renderClipboardList();
}

function getBlockCards(blockEl) {
  if (!blockEl) return [];

  return [...blockEl.querySelectorAll(".clip-card")]
    .map(cardEl => {
      const titleEl = cardEl.querySelector(".clip-title, .clip-title-link");
      if (!titleEl) return null;

      return {
        title: titleEl.textContent.trim(),
        href: titleEl.tagName === "A" ? titleEl.getAttribute("href") : "",

        skill: cardEl.dataset.skill || "",
        tier: cardEl.dataset.tier || "",
        discipline: cardEl.dataset.discipline || "",
        journey: cardEl.dataset.journey || "",
        category: cardEl.dataset.category || "",
        lane: cardEl.dataset.lane || ""
      };
    })
    .filter(Boolean);
}

function getBlockCardTitles(blockEl) {
  if (!blockEl) return [];

  return [...blockEl.querySelectorAll(".clip-title, .clip-title-link")]
    .map(el => el.textContent.trim())
    .filter(Boolean);
}

function broadcastRunState() {
  localStorage.setItem("sandman_run_state", JSON.stringify({
    running: INLINE_RUN.running,
    paused: INLINE_RUN.paused,
    index: INLINE_RUN.index,
    secondsLeft: INLINE_RUN.secondsLeft,
    totalSecondsLeft: INLINE_RUN.totalSecondsLeft,
    playlist: INLINE_RUN.playlist.map(p => ({
      title: p.title,
      minutes: p.minutes,
      slot: p.slot,
      cards: getBlockCards(p.el)
    })),
    ts: Date.now()
  }));
}
schemaBtns.forEach(btn => {
  btn.addEventListener("click", () => setSchema(btn.dataset.schema));
});

singleFocusEl?.addEventListener("change", () => {
  if (INLINE_RUN.running || INLINE_RUN.paused) {
    saveStatusEl.textContent = "Stop practice before changing focus.";
    return;
  }

  if (currentSchema === "quick-45") {
    applySingleTemplate();
    renderClipboardList();
  }
});

document.addEventListener("input", e => {
  const inp = e.target.closest(".min-input");
  if (!inp || inp.readOnly) return;

  const blk = inp.closest(".plan-block");
  let v = Math.max(5, Math.min(60, Number(inp.value || 5)));
  inp.value = v;
  blk.dataset.minutes = v;

  const clock = blk.querySelector(".mini-clock");
  if (clock) clock.textContent = `${String(v).padStart(2, "0")}:00`;

  recalcTotal();
});

document.addEventListener("click", e => {
  const mv = e.target.closest(".move-btn");
  if (!mv) return;

  const dir = mv.dataset.dir;
  const block = mv.closest(".sw");
  const parent = document.getElementById("swappable");

  if (!block || !parent || block.classList.contains("hidden")) return;

  const visibleSwBlocks = [...parent.querySelectorAll(".sw:not(.hidden)")];
  const idx = visibleSwBlocks.indexOf(block);
  if (idx === -1) return;

  if (dir === "up" && idx > 0) {
    parent.insertBefore(block, visibleSwBlocks[idx - 1]);
  }

  if (dir === "down" && idx < visibleSwBlocks.length - 1) {
    parent.insertBefore(visibleSwBlocks[idx + 1], block);
  }
});
/* =========================
   CARD → CLIPBOARD BRIDGE
   LANE-BASED RENDER
========================= */

const CLIPBOARD_KEY = "sandman_clipboard_v1";

function getStoredClipboardCards() {
  try {
    const arr = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function getCoachSessionPayload() {
  try {
    return JSON.parse(localStorage.getItem(COACH_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
function clearSlotCards(slotEl) {
  if (!slotEl) return;
  slotEl.querySelectorAll(".clip-card").forEach(node => node.remove());
}

function clearClipboardSlots() {
  const bank = document.getElementById("clipboard-list");
  if (bank) bank.innerHTML = "";

  [
    "slot-onmat",
    "slot-warmup",
    "slot-technique",
    "slot-drills",
    "slot-water",
    "slot-live",
    "slot-cond",
    "slot-offmat"
  ].forEach(id => {
    clearSlotCards(document.getElementById(id));
  });
}
// helpers / utilities (top of file or above render)
// --- HELPERS ---

// other helpers...
function getAutoDesc(card) {
  if (card.desc) return card.desc;

  const title = (card.title || "").toLowerCase();
  const category = (card.category || "").toLowerCase().trim();
  const lane = (card.lane || "").toLowerCase().trim();

  if (lane === "water" || category === "game" || category === "games") {
    return "Reset on your own";
  }

  if (title.includes("push")) return "3–5 sets";
  if (title.includes("sit")) return "3–5 sets";
  if (title.includes("pull")) return "3–5 sets";

  if (title.includes("plank")) return "3 x 30 sec hold";
  if (title.includes("hold")) return "hold + control position";

  if (title.includes("carry")) return "down & back x 3";
  if (title.includes("walk")) return "down & back x 3";
  if (title.includes("drag")) return "down & back x 3";

  if (title.includes("crawl")) return "forward + backward";
  if (title.includes("bear")) return "forward + backward";

  if (title.includes("sprint")) return "wall to wall x 3";
  if (title.includes("shuttle")) return "wall to wall x 3";

  if (title.includes("balance")) return "hold + control position";

  if (category === "conditioning") return "3–5 sets";
  if (category === "warmup") return "controlled reps";

  return "";
}

function appendCardToSlot(slot, card) {
  if (!slot) return;

const slotKey =
  slot.dataset.slot;

const limit =
  getSlotLimit(slotKey);
  const currentCards = slot.querySelectorAll(".clip-card");

  if (currentCards.length >= limit) {
    console.warn(`🚫 Slot limit reached (${limit}) for`, card);
    return; // 🔒 HARD LOCK
  }

  slot.appendChild(makeClipCard(card));
}

function makeClipCard(card) {
  const el = document.createElement("div");
  
  el.setAttribute("contenteditable", "false");

  const title = (card.title || "Untitled").trim();
  const href = typeof card.href === "string" ? card.href.trim() : "";
  const category = (card.category || "").toLowerCase();

if (category === "mat-talk") {
  el.innerHTML = `
    <div class="clip-card-body compact mat-talk-card">
      <div class="clip-card-lines">
        <div class="clip-line1">
          ${href
            ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
            : `<span class="clip-title">${escapeHtml(title)}</span>`}
        </div>
      </div>
    </div>
  `;
  return el;
}

/* 👇 ADD THIS RIGHT HERE 👇 */

const lane = (card.lane || "").toLowerCase().trim();

if (

  ["game", "games", "warmup", "conditioning", "cond"]
    .includes(category)

  ||

  [
    "water",
    "game",
    "games",

    "warmup",
    "warmup_body",
    "warmup_agility",

    "warmup_footwork",
    "warmup_striking_motion",
    "warmup_reaction",

    "warmup_transition",
    "warmup_movement",
    "warmup_live",

    "cond",
    "conditioning"

  ].includes(lane)

) {
  
const desc = getAutoDesc(card);
  el.innerHTML = `
    <div class="clip-card-body compact">
      <div class="clip-card-lines">
        <div class="clip-line1">
          ${href
            ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
            : `<span class="clip-title">${escapeHtml(title)}</span>`}
        </div>
        ${desc ? `<div class="clip-line2">— ${escapeHtml(desc)}</div>` : ""}
      </div>
    </div>
  `;
  return el;
}

/* 👇 EXISTING DEFAULT SKILL RENDER STAYS BELOW 👇 */

  const skill = String(card.skill || "").padStart(2, "0");
  const tier = (card.tier || "").trim().toUpperCase();
  const cue = typeof card.cue === "string" ? card.cue.trim() : "";

  const cleanTitle = title.replace(/^Skill\s*\d+\s*[—-]\s*/i, "").trim();

  el.innerHTML = `
    <div class="clip-card-body compact">
      <div class="clip-card-lines">
        <div class="clip-line1">
          ${href
            ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(cleanTitle)}</a>`
            : `<span class="clip-title">${escapeHtml(cleanTitle)}</span>`}
        </div>

        ${(skill || tier) ? `
          <div class="clip-line2">
            — Skill ${escapeHtml(skill)} · ${escapeHtml(tier)}
          </div>
        ` : ""}

        ${cue ? `
          <div class="clip-line3">
            — ${escapeHtml(cue)}
          </div>
        ` : ""}
      </div>
    </div>
  `;

  return el;
}


function getSlotUserText(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return "";

  const clone = slot.cloneNode(true);
  clone.querySelectorAll(".clip-card, [data-card-spacer='true']").forEach(node => node.remove());

  return clone.textContent.trim();
}
function dedupeClipboardCards(cards) {
  const seen = new Set();

  return cards.filter(card => {
    const id = String(card.id || "").trim().toLowerCase();
    const lane = String(card.lane || "").trim().toLowerCase();

    const key = `${id}__${lane}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function renderClipboardList() {
  clearClipboardSlots();

  const allCards = dedupeClipboardCards(getStoredClipboardCards());
  const bankCards = allCards.filter(card => !card.lane);

  const bank = document.getElementById("clipboard-list");

  if (!allCards.length) {
    if (currentSchema === "quick-45" && bank) {
      bank.innerHTML = `<div class="muted">No cards added yet.</div>`;
    }
    return;
  }

  if (currentSchema === "quick-45" && bank) {
    if (!bankCards.length) {
      bank.innerHTML = `<div class="muted">No saved bank cards.</div>`;
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

    const lane = (card.lane || "").toLowerCase();

    if (lane === "cond" && (card.target === "warmup_body" || card.target === "warmup_agility")) {
      return;
    }

const category = (card.category || "").toLowerCase().trim();

const isGame = category === "game" || category === "games" || lane === "games";

const allowGames =
  ["elite-90", "extended-120"].includes(currentSchema) &&
  (lane === "water" || lane === "games");

if (isGame && !allowGames) {
  return; // 🔒 block games everywhere else
}
    const slotId = LANE_MAP[lane];
    if (!slotId) return;

    const slotEl = document.getElementById(slotId);
    appendCardToSlot(slotEl, card);
  });
}

/* =========================
   SAVE PLAN
========================= */

function getNotesValue(slotKey) {
  const el = document.getElementById(`notes-${slotKey}`);
  return el?.value.trim() || "";
}

async function saveCurrentPlanToFirestore() {
  const blocksDom = [
    ...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")
  ];

  const blocks = blocksDom.map(b => ({
    slot: b.dataset.slot,
    label: b.querySelector(".block-title")?.textContent?.trim() || b.dataset.slot,
    minutes: Number(b.dataset.minutes || 0),
    text: getNotesValue(b.dataset.slot)
  }));

  const totalMinutes = blocks.reduce((sum, b) => sum + b.minutes, 0);

  const payload = {
    schema: currentSchema,
    singleFocus: currentSchema === "quick-45" ? singleFocusEl.value : null,

    onmat: getNotesValue("onmat"),
    warmup: getNotesValue("warmup"),
    drills: getNotesValue("drills"),
    technique: getNotesValue("technique"),
    water: getNotesValue("water"),
    live: getNotesValue("live"),
    cond: getNotesValue("cond"),
    offmat: getNotesValue("offmat"),

    note: document.getElementById("slot-note")?.value.trim() || "",
    blocks,
    totalMinutes,
    updatedAt: serverTimestamp(),
    source: "practice-plan"
  };

  const key = new Date().toISOString().slice(0, 10);
  await setDoc(doc(db, "practicePlans", key), payload, { merge: true });
  return key;
}

window.savePlan = async function () {
  try {
    await saveCurrentPlanToFirestore();
    saveStatusEl.textContent = "Saved.";
  } catch (err) {
    console.error(err);
    saveStatusEl.textContent = "Save failed.";
  }
};

window.clearSession = function () {
  const ok = window.confirm("Clear this session?");
  if (!ok) return;

  localStorage.removeItem("sandman_clipboard_v1");

  const noteIds = [
    "notes-onmat",
    "notes-warmup",
    "notes-drills",
    "notes-technique",
    "notes-water",
    "notes-live",
    "notes-cond",
    "notes-offmat"
  ];

  noteIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const cardSlots = [
    "cards-onmat",
    "cards-warmup-body",
    "cards-warmup-agility",
    "cards-drills",
    "cards-technique",
    "cards-water",
    "cards-live",
    "cards-cond",
    "cards-offmat"
  ];

  cardSlots.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  const note = document.getElementById("slot-note");
  if (note) note.value = "";

  renderClipboardList();
  saveStatusEl.textContent = "Session cleared.";
};

/* =========================
   INLINE CLIPBOARD RUNNER
========================= */

const INLINE_RUN = {
  playlist: [],
  index: 0,
  secondsLeft: 0,
  totalSecondsLeft: 0,
  blockEndsAt: 0,
practiceEndsAt: 0,
  timerId: null,
  paused: false,
  running: false,
  completedSlots: new Set()
};
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && INLINE_RUN.running) {
    tickInlinePractice();
    syncInlineDisplay();
  }
});

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateTotalClockDisplay() {
  if (!totalTimeEl) return;

  if (INLINE_RUN.running || INLINE_RUN.paused) {
    totalTimeEl.textContent = "Remaining: " + formatClock(INLINE_RUN.totalSecondsLeft);
  } else {
    recalcTotal();
  }
}

function clearRunningHighlights() {
  document.querySelectorAll("#planBlocks .plan-block").forEach(el => {
    el.classList.remove("running-now");
  });
}

function buildInlinePlaylist() {
  return [...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")]
    .map(block => ({
      el: block,
      slot: block.dataset.slot,
      title: block.querySelector(".block-title")?.textContent?.trim() || block.dataset.slot,
      minutes: Number(block.dataset.minutes || 0)
    }))
    .filter(item => item.minutes > 0);
}

function syncInlineDisplay() {
  if (inlineClockEl) inlineClockEl.textContent = formatClock(INLINE_RUN.secondsLeft);

  const current = INLINE_RUN.playlist[INLINE_RUN.index];

  if (inlineCurrentBlockEl) {
    inlineCurrentBlockEl.textContent = current
      ? `${current.title} • ${current.minutes} min`
      : "No active block.";
  }

  clearRunningHighlights();

  document.querySelectorAll("#planBlocks .plan-block:not(.hidden)").forEach(block => {
    const clock = block.querySelector(".mini-clock");
    const minutes = Number(block.dataset.minutes || 0);
    const slot = block.dataset.slot;

    if (!clock) return;

    if (current && slot === current.slot) {
      block.classList.add("running-now");
      clock.textContent = formatClock(INLINE_RUN.secondsLeft);
    } else if (INLINE_RUN.completedSlots.has(slot)) {
      clock.textContent = "00:00";
    } else {
      clock.textContent = `${String(minutes).padStart(2, "0")}:00`;
    }
  });

  updateTotalClockDisplay();
}

function advanceInlineBlock() {
  const finished = INLINE_RUN.playlist[INLINE_RUN.index];
  if (finished?.slot) INLINE_RUN.completedSlots.add(finished.slot);

  INLINE_RUN.index += 1;

  if (INLINE_RUN.index >= INLINE_RUN.playlist.length) {
    stopInlinePractice(true);
    return;
  }

  INLINE_RUN.secondsLeft = INLINE_RUN.playlist[INLINE_RUN.index].minutes * 60;
  INLINE_RUN.blockEndsAt = Date.now() + INLINE_RUN.secondsLeft * 1000;
  setInlineRunState("running");
  syncInlineDisplay();
}

function tickInlinePractice() {
  if (!INLINE_RUN.running || INLINE_RUN.paused) return;

  INLINE_RUN.secondsLeft = Math.max(
    0,
    Math.ceil((INLINE_RUN.blockEndsAt - Date.now()) / 1000)
  );

  INLINE_RUN.totalSecondsLeft = Math.max(
    0,
    Math.ceil((INLINE_RUN.practiceEndsAt - Date.now()) / 1000)
  );

  if (INLINE_RUN.secondsLeft <= 0) {
    advanceInlineBlock();
    broadcastRunState();
    return;
  }

  syncInlineDisplay();
  broadcastRunState();
}

function startInlinePractice() {
  if (!INLINE_RUN.running) {
    INLINE_RUN.playlist = buildInlinePlaylist();
    INLINE_RUN.index = 0;
    INLINE_RUN.completedSlots = new Set();

    if (!INLINE_RUN.playlist.length) {
      if (saveStatusEl) saveStatusEl.textContent = "No visible blocks to run.";
      return;
    }

    INLINE_RUN.totalSecondsLeft = INLINE_RUN.playlist.reduce(
      (sum, item) => sum + (item.minutes * 60),
      0
    );

    INLINE_RUN.secondsLeft = INLINE_RUN.playlist[0].minutes * 60;
    INLINE_RUN.blockEndsAt = Date.now() + INLINE_RUN.secondsLeft * 1000;
    INLINE_RUN.practiceEndsAt = Date.now() + INLINE_RUN.totalSecondsLeft * 1000;
    INLINE_RUN.running = true;
    INLINE_RUN.paused = false;

    setInlineRunState("running");
    syncInlineDisplay();
    updateTotalClockDisplay();
    broadcastRunState();
INLINE_RUN.timerId = setInterval(() => {
  if (!document.hidden) {
    tickInlinePractice();
  }
}, 1000);
    return;
  }

  if (INLINE_RUN.paused) {
    INLINE_RUN.paused = false;
    setInlineRunState("running");
    updateTotalClockDisplay();
    broadcastRunState();
  }
}

function pauseInlinePractice() {
  if (!INLINE_RUN.running) return;
  INLINE_RUN.paused = true;
  setInlineRunState("paused");
  updateTotalClockDisplay();
   broadcastRunState();
}

function resetBlockClocksToPlannedTime() {
  document.querySelectorAll("#planBlocks .plan-block:not(.hidden)").forEach(block => {
    const clock = block.querySelector(".mini-clock");
    const minutes = Number(block.dataset.minutes || 0);

    if (!clock) return;
    clock.textContent = `${String(minutes).padStart(2, "0")}:00`;
  });
}

function stopInlinePractice(finished = false) {
  INLINE_RUN.running = false;
  INLINE_RUN.paused = false;

  if (INLINE_RUN.timerId) {
    clearInterval(INLINE_RUN.timerId);
    INLINE_RUN.timerId = null;
  }

  INLINE_RUN.playlist = [];
  INLINE_RUN.index = 0;
  INLINE_RUN.secondsLeft = 0;
  INLINE_RUN.totalSecondsLeft = 0;
  INLINE_RUN.completedSlots = new Set();

  clearRunningHighlights();
  resetBlockClocksToPlannedTime();

  if (inlineClockEl) inlineClockEl.textContent = "00:00";

  if (inlineCurrentBlockEl) {
    inlineCurrentBlockEl.textContent = finished
      ? "Practice complete."
      : "No active block.";
  }

  setInlineRunState("stopped");

  if (inlineRunStatusEl && finished) {
    inlineRunStatusEl.textContent = "complete";
  }

  if (totalTimeEl) {
    totalTimeEl.textContent = "Total: 00:00";
  }
    // 🔥 ADD THIS
  broadcastRunState();
  
}

window.openTimerWindow = function () {
  const w = window.open(
    "/lab/timer-engine/ui/athlete/sandman-coach-timer.html",
    "sandmanTimer",
    "width=760,height=820"
  );
  w && w.focus();
};
window.runPractice = async function () {
  if (!authReady) {
    console.warn("⏳ Auth not ready yet");
    saveStatusEl.textContent = "Loading auth...";
    startInlinePractice();

    return;
  }

  try {
    await saveCurrentPlanToFirestore();
    startInlinePractice();
    saveStatusEl.textContent = "Saved and running inline.";

    // 🔥 ADD THIS

  } catch (err) {
    console.error(err);
    startInlinePractice();
    saveStatusEl.textContent = "Running (offline)";

    // 🔥 ADD THIS
   }
};

let clipboardState = null;

(function init() {
  const savedTheme = localStorage.getItem("clipboardTheme") || "night";
  applyClipboardTheme(savedTheme);
const coachSession = getCoachSessionPayload();

if (coachSession?.schema && SCHEMAS[coachSession.schema]) {
  currentSchema = coachSession.schema;
  loadCurrentSchema();

  if (saveStatusEl) {
    saveStatusEl.textContent = "Loaded from Coach Console.";
  }
}
  // 🔥 TRY TO RESTORE SESSION FIRST
  const savedSession = localStorage.getItem("sandman_clipboard_session");

  if (savedSession) {
    try {
      clipboardState = JSON.parse(savedSession);
    } catch {
      clipboardState = null;
    }
  }

  // 🔥 FALLBACK ONLY IF NOTHING SAVED (your code — correct)
  if (!clipboardState) {
    const savedSchema = localStorage.getItem("sandman_clipboard_schema") || "quick-45";

    if (SCHEMAS[savedSchema]) {
      setSchema(savedSchema);
    } else {
      setSchema("quick-45");
    }
  }

  renderClipboardList();
  setInlineRunState("stopped");

  if (inlinePauseBtn) inlinePauseBtn.addEventListener("click", pauseInlinePractice);
  if (inlineStopBtn) inlineStopBtn.addEventListener("click", () => stopInlinePractice(false));
})();
// =========================
// END PRACTICE → LOG BRIDGE
// =========================
window.endPractice = function endPractice() {
  try {
    const coachSession =
  getCoachSessionPayload() || {};
    const blocksDom = [
      ...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")
    ];

    const blocks = blocksDom.map(b => ({
      slot: b.dataset.slot,
      label: b.querySelector(".block-title")?.textContent?.trim() || b.dataset.slot,
      minutes: Number(b.dataset.minutes || 0),
      notes: document.getElementById(`notes-${b.dataset.slot}`)?.value.trim() || ""
    }));

    const payload = {
      schema: currentSchema,
      track:
  coachSession?.track || "",

    discipline:
  coachSession?.discipline || "",

    journey:
  coachSession?.journey || "",

    tier:
  coachSession?.tier || "",
      focus: document.getElementById("slot-note")?.value.trim() || "",
      totalTime: totalTimeEl?.textContent || "",
      blocks,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem("sandman_last_practice_payload", JSON.stringify(payload));

    window.location.href = "/coaches/logs/practice-log.html";

  } catch (err) {
    console.error("End practice failed:", err);
    saveStatusEl.textContent = "Error ending practice.";
  }
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =========================
// AUTO GROW NOTES
// =========================

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

  box.value += (box.value ? "\n\n" : "") + items.join("\n");
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
    const cleaned = line.charAt(0).toLowerCase() + line.slice(1);
    return `Did you ${cleaned}?`;
  });

  offmatBox.value += (offmatBox.value ? "\n\n" : "") + questions.join("\n");
  offmatBox.dispatchEvent(new Event("input"));
});

function getCultureLesson(id) {
  return CULTURE_LESSONS.find(lesson => lesson.id === id) || null;
}

function insertLessonIntoBox(boxId, lessonId, mode = "onmat") {
  const box = document.getElementById(boxId);
  const lesson = getCultureLesson(lessonId);

  if (!box || !lesson) return;

  let lines = [];

  if (mode === "onmat") {
    if (lesson.onmat?.line) lines.push(lesson.onmat.line);
    if (lesson.onmat?.coach) lines.push(lesson.onmat.coach);
  } else {
    if (lesson.offmat?.reflect) lines.push(lesson.offmat.reflect);
    if (lesson.offmat?.close) lines.push(lesson.offmat.close);
  }

  if (!lines.length) return;

  box.value += (box.value ? "\n\n" : "") + lines.join("\n");
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

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("slot-notes-input")) {
    autoGrow(e.target);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".slot-notes-input").forEach(autoGrow);

  // CLOCK TOGGLE
  const clockToggle = document.getElementById("clockToggle");

  clockToggle?.addEventListener("click", () => {
    document.body.classList.toggle("clock-mode");
  });
});