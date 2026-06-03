import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "/assets/js/firebase-init.js";
import { CULTURE_LESSONS } from "/coaches/culture/culture-lessons.js";

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
const CLIPBOARD_KEY = "sandman_clipboard_v1";
const COACH_SESSION_KEY = "sandman_coach_session_v1";
const BIG_CLOCK_KEY = "sandman_big_clock_payload_v2";
const LAST_PRACTICE_KEY = "sandman_last_practice_payload";

function getSessionPayload() {
  try {
    return JSON.parse(
      localStorage.getItem(SESSION_KEY) || "{}"
    );
  } catch {
    return {};
  }
}

/* =========================
   SCHEMAS
========================= */

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

  "elite-90": {
    mode: "board",
    label: "Elite 90",
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
    label: "Extended 120",
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

let builderSession = getSessionPayload();

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
    sessionId: builderSession.sessionId || "lompoc-mat-1",
    academyId: builderSession.academyId || "lompoc",
    roomId: builderSession.roomId || "mat-1",
    program: builderSession.program || "",
    track: builderSession.track || "",
    journey: builderSession.journey || "",
    discipline: String(builderSession.discipline || "").toLowerCase(),
    tier: String(builderSession.tier || "").toLowerCase()
  };
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

function getSchemaMaxMinutes(schemaKey) {
  return SCHEMAS[schemaKey]?.maxMinutes || 0;
}

function recalcTotal() {
  if (!totalTimeEl) return;

  const mins = BLOCK_KEYS
    .map(k => blockEls[k])
    .filter(el => el && !el.classList.contains("hidden"))
    .reduce((sum, b) => sum + Number(b.dataset.minutes || 0), 0);

  totalTimeEl.textContent =
    `Total: ${String(Math.floor(mins)).padStart(2, "0")}:00`;

  const max = getSchemaMaxMinutes(currentSchema);
  const over = max > 0 && mins > max;

  totalTimeEl.classList.toggle("over", over);
}

function updateClipboardBankVisibility() {
  if (!clipboardBankEl) return;

  clipboardBankEl.style.display =
    currentSchema === "quick-45" ? "block" : "none";
}

function updateGameButtonVisibility() {
  const btn = document.getElementById("btn-add-game");
  if (!btn) return;

  const show =
    currentSchema === "elite-90" ||
    currentSchema === "extended-120";

  btn.style.display = show ? "inline-block" : "none";
}

/* =========================
   TEMPLATE LOADING
========================= */

function applySingleTemplate() {
  const schema = SCHEMAS["quick-45"];
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
}

window.loadCurrentSchema = function () {
  if (currentSchema === "quick-45") {
    applySingleTemplate();
  } else {
    applyBlockTemplate(currentSchema);
  }
};

/* =========================
   CARD DATA HELPERS
========================= */

function getBlockCards(blockEl) {
  if (!blockEl) return [];

  return [...blockEl.querySelectorAll(".clip-title, .clip-title-link")]
    .map(el => {
      const cardEl = el.closest(".clip-card");

      return {
        title: el.textContent.trim(),
        href: el.tagName === "A" ? el.getAttribute("href") : "",

        skill: cardEl?.dataset.skill || "",
        tier: cardEl?.dataset.tier || "",
        discipline: cardEl?.dataset.discipline || "",
        journey: cardEl?.dataset.journey || "",
        category: cardEl?.dataset.category || "",
        lane: cardEl?.dataset.lane || ""
      };
    })
    .filter(card => card.title);
}

function getStoredClipboardCards() {
  try {
    const arr = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function clearSlotCards(slotEl) {
  if (!slotEl) return;

  slotEl
    .querySelectorAll(".clip-card")
    .forEach(node => node.remove());
}

function clearClipboardSlots() {

  const bank =
    document.getElementById("clipboard-list");

  if (bank) bank.innerHTML = "";

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

    const slot =
      document.getElementById(id);

    if (!slot) return;

    slot
      .querySelectorAll(".clip-card")
      .forEach(node => node.remove());

  });

}

function getSlotLimit(card) {
  const category = (card.category || "").toLowerCase().trim();
  const lane = (card.lane || "").toLowerCase().trim();

  if (
    category === "mat-talk" ||
    lane === "onmat" ||
    lane === "offmat"
  ) {
    return 1;
  }

  return 3;
}

function getAutoDesc(card) {
  if (card.desc) return card.desc;

  const title = (card.title || "").toLowerCase();
  const category = (card.category || "").toLowerCase().trim();
  const lane = (card.lane || "").toLowerCase().trim();

  if (
    lane === "water" ||
    category === "game" ||
    category === "games"
  ) {
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

  const limit = getSlotLimit(card);
  const currentCards = slot.querySelectorAll(".clip-card");

  if (currentCards.length >= limit) {
    console.warn(`🚫 Slot limit reached (${limit}) for`, card);
    return;
  }

  slot.appendChild(makeClipCard(card));
}

function makeClipCard(card) {
  const el = document.createElement("div");

  el.className = "clip-card";
  el.setAttribute("contenteditable", "false");

  const title = (card.title || "Untitled").trim();
  const href = typeof card.href === "string" ? card.href.trim() : "";
  const category = (card.category || "").toLowerCase();
  const lane = (card.lane || "").toLowerCase().trim();

  const hrefParts = href.split("/").filter(Boolean);

  const parsedDiscipline =
    hrefParts.includes("p2l-kickboxing") ? "kickboxing" :
    hrefParts.includes("p2l-boxing") ? "boxing" :
    hrefParts.includes("p2l-wrestling") ? "wrestling" :
    hrefParts.includes("z2h-wrestling") ? "wrestling" :
    hrefParts.includes("q2m-mma") ? "mma" :
    hrefParts.includes("r2g-boxing") ? "boxing" :
    "";

  const parsedJourney =
    hrefParts.includes("p2l-kickboxing") ||
    hrefParts.includes("p2l-boxing") ||
    hrefParts.includes("p2l-wrestling") ? "p2l" :
    hrefParts.includes("z2h-wrestling") ? "z2h" :
    hrefParts.includes("q2m-mma") ? "q2m" :
    hrefParts.includes("r2g-boxing") ? "r2g" :
    "";

  const parsedTier =
    hrefParts.find(part => /^t\d+$/i.test(part)) || "";

  const skillMatch = href.match(/skill-(\d+)/i);
  const parsedSkill = skillMatch ? skillMatch[1] : "";

  el.dataset.skill = card.skill || parsedSkill || "";
  el.dataset.tier = card.tier || parsedTier || "";
  el.dataset.discipline = card.discipline || parsedDiscipline || "";
  el.dataset.journey = card.journey || parsedJourney || "";
  el.dataset.category = card.category || "";
  el.dataset.lane = card.lane || "";

  if (category === "mat-talk") {
    el.innerHTML = `
      <div class="clip-card-body compact mat-talk-card">
        <div class="clip-card-lines">
          <div class="clip-line1">
            ${
              href
                ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
                : `<span class="clip-title">${escapeHtml(title)}</span>`
            }
          </div>
        </div>
      </div>
    `;

    return el;
  }

  if (
    ["game", "games", "warmup", "conditioning", "cond"].includes(category) ||
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
]
  ) {
    const desc = getAutoDesc(card);

    el.innerHTML = `
      <div class="clip-card-body compact">
        <div class="clip-card-lines">
          <div class="clip-line1">
            ${
              href
                ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
                : `<span class="clip-title">${escapeHtml(title)}</span>`
            }
          </div>

          ${desc ? `<div class="clip-line2">— ${escapeHtml(desc)}</div>` : ""}
        </div>
      </div>
    `;

    return el;
  }

  const skill = String(card.skill || parsedSkill || "").padStart(2, "0");
  const tier = (card.tier || parsedTier || "").trim().toUpperCase();
  const cue = typeof card.cue === "string" ? card.cue.trim() : "";

  const cleanTitle =
    title.replace(/^Skill\s*\d+\s*[—-]\s*/i, "").trim();

  el.innerHTML = `
    <div class="clip-card-body compact">
      <div class="clip-card-lines">
        <div class="clip-line1">
          ${
            href
              ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(cleanTitle)}</a>`
              : `<span class="clip-title">${escapeHtml(cleanTitle)}</span>`
          }
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

function dedupeClipboardCards(cards) {
  const seen = new Set();

  return cards.filter(card => {
    const id = String(card.id || card.href || card.title || "")
      .trim()
      .toLowerCase();

    const lane = String(card.lane || "")
      .trim()
      .toLowerCase();

    const key = `${id}__${lane}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

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
  dedupeClipboardCards(getStoredClipboardCards());


const allCards =
  rawCards.filter(cardMatchesSession);



  const bankCards =
    allCards.filter(card => !card.lane);

  const bank =
    document.getElementById("clipboard-list");

  if (!allCards.length) {

    if (currentSchema === "quick-45" && bank) {
      bank.innerHTML =
        `<div class="muted">No cards added yet.</div>`;
    }

    return;
  }

  if (currentSchema === "quick-45" && bank) {

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
      ["elite-90", "extended-120"].includes(currentSchema) &&
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

window.runPractice = async function () {
  const session = getActiveSession();

  const blocks = [
    ...document.querySelectorAll("#planBlocks .plan-block:not(.hidden)")
  ]
    .map(b => ({
      slot: b.dataset.slot,
      title:
        b.querySelector(".block-title")?.textContent?.trim() ||
        b.dataset.slot,
      minutes: Number(b.dataset.minutes || 0),
      cards: getBlockCards(b),
      notes:
        document.getElementById(`notes-${b.dataset.slot}`)
          ?.value
          .trim() || ""
    }))
    .filter(b => b.minutes > 0);

  const clockPayload = {
    source: "clipboard",
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

    blocks,
    autoStart: false,
    createdAt: new Date().toISOString()
  };

  const coachSessionPayload = {
    source: "clipboard",
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

    focus:
      document.getElementById("slot-note")?.value.trim() || "",

    blocks,

    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(
    COACH_SESSION_KEY,
    JSON.stringify(coachSessionPayload)
  );

  localStorage.setItem(
    BIG_CLOCK_KEY,
    JSON.stringify(clockPayload)
  );

  const liveSessionPayload = {
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

  if (currentSchema === "quick-45") {
    applySingleTemplate();
    renderClipboardList();
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
localStorage.setItem(
  RETURN_TO_KEY,
  ALL_IN_ONE_RETURN
);
openDisciplineCards();
});
/* =========================
   SAVE PLAN
========================= */

function getNotesValue(slotKey) {
  const el = document.getElementById(`notes-${slotKey}`);
  return el?.value.trim() || "";
}

async function saveCurrentPlanToFirestore() {
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
    cards: getBlockCards(b)
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

    singleFocus:
      currentSchema === "quick-45"
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
    setStatus("Save failed.");
  }
};
/* =========================
   CLEAR SESSION
========================= */

window.clearSession = function () {
  const ok = window.confirm("Clear this session?");
  if (!ok) return;

  localStorage.removeItem(CLIPBOARD_KEY);

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
      cards: getBlockCards(b)
    }));

    const payload = {
      source: "clipboard",
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

    window.location.href = "/coaches/logs/practice-log.html";

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
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

  const session = getActiveSession();

  if (SCHEMAS[session.schema]) {
    currentSchema = session.schema;
  }

  localStorage.setItem(
    "sandman_clipboard_schema",
    currentSchema
  );

  loadCurrentSchema();
  updateSupportLinks();

  if (Array.isArray(hybridCards) && hybridCards.length) {

    const existingCards =
      getStoredClipboardCards()
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

  const hybridIdentityEl =
    document.getElementById("hybridIdentity");

  const hybridCycleEl =
    document.getElementById("hybridCycle");

  if (hybridIdentityEl) {
    hybridIdentityEl.textContent =
      `${journeyLabel} ${disciplineLabel} · ${tierLabel} ${rankLabel}`;
  }

  if (hybridCycleEl) {
    hybridCycleEl.textContent =
      `Week ${week} · ${phase} · ${(waveKey || "").replaceAll("_", " ")}`;
  }

})();