import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const COACH_SESSION_KEY = "sandman_coach_session_v1";
const LAST_PRACTICE_KEY = "sandman_last_practice_payload";

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

const blockEls = Object.fromEntries(
  BLOCK_KEYS.map(key => [key, document.getElementById(`block-${key}`)])
);

const saveStatusEl = document.getElementById("saveStatus");
const totalTimeEl = document.getElementById("totalTime");
const focusEl = document.getElementById("slot-note");

async function waitForAuth() {
  try {
    await ensureSignedIn();
  } catch (err) {
    console.warn("Coach Companion auth warning:", err);
    setStatus("Auth failed.");
  }
}

let activeCoachSession = null;
let hydrationComplete = false;

function getCoachSessionPayload() {
  if (activeCoachSession?.blocks?.length) {
    return activeCoachSession;
  }

  try {
    const local = JSON.parse(
      localStorage.getItem(COACH_SESSION_KEY) || "null"
    );

    if (local?.blocks?.length) {
      activeCoachSession = local;
      return activeCoachSession;
    }
  } catch {}

  return null;
}

function setStatus(message) {
  if (saveStatusEl) saveStatusEl.textContent = message;
}

function showBlock(key, show) {
  blockEls[key]?.classList.toggle("hidden", !show);
}

function setTitle(key, title) {
  const el = document.getElementById(`title-${key}`);
  if (el) el.textContent = title || key;
}

function setMinutes(key, minutes) {
  const block = blockEls[key];
  if (!block) return;

  const safeMinutes = Number(minutes || 0);
  block.dataset.minutes = safeMinutes;

  const clock = block.querySelector(".mini-clock");
  if (clock) {
    clock.textContent = `${String(safeMinutes).padStart(2, "0")}:00`;
  }
}

function clearCards() {
  document.querySelectorAll(".slot-cards").forEach(el => {
    el.innerHTML = "";
  });
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
function getCardContainer(slot) {

  return document.getElementById(
    LANE_MAP[slot]
  );

}

function renderCardTitle(container, card) {
  if (!container || !card) return;

  const title = typeof card === "string" ? card : card.title;
  const href = typeof card === "object" ? card.href : "";

  if (!title) return;

  const el = document.createElement("div");
  el.className = "clip-card";

  if (typeof card === "object") {
    el.dataset.skill = card.skill || "";
    el.dataset.tier = card.tier || "";
    el.dataset.discipline = card.discipline || "";
    el.dataset.journey = card.journey || "";
  }

  el.innerHTML = `
    <div class="clip-card-body compact">
      <div class="clip-card-lines">
        <div class="clip-line1">
          ${
            href
              ? `<a class="clip-title-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
              : escapeHtml(title)
          }
        </div>
      </div>
    </div>
  `;

  container.appendChild(el);
}
async function hydrateFromLiveSession() {

  const params =
    new URLSearchParams(window.location.search);

  const sessionId =
    params.get("session");

  if (!sessionId) return;

  try {

    const snap =
      await getDoc(
        doc(db, "liveSessions", sessionId)
      );

    if (!snap.exists()) {
      setStatus("Live session not found.");
      return;
    }

const live = snap.data();

console.log("LIVE SESSION", live);

const payload = live?.payload || live;
const blocks = Array.isArray(payload?.blocks)
  ? payload.blocks
  : [];

if (!blocks.length) {
  setStatus("Live session empty.");
  return;
}

const coachPayload = {
  sessionId,

  schema: payload.schema || "",
  discipline: payload.discipline || "",
  journey: payload.journey || "",
  tier: payload.tier || "",
  focus: payload.focus || "",

  blocks
};
    /* IMPORTANT */

    activeCoachSession = coachPayload;

    localStorage.setItem(
      COACH_SESSION_KEY,
      JSON.stringify(coachPayload)
    );

    setStatus("Live session loaded.");

  } catch (err) {
console.error("HYDRATE ERROR", err);

setStatus(
  err?.message || "Live session load failed."
);
  }
}

function renderCoachSession() {
  if (!hydrationComplete) return;
  let session = getCoachSessionPayload();

 if (!session?.blocks?.length) {

  if (activeCoachSession?.blocks?.length) {
    session = activeCoachSession;
  } else {
    return;
  }

}
  BLOCK_KEYS.forEach(key => showBlock(key, false));
  clearCards();

  let total = 0;

  session.blocks.forEach(block => {
    const key = block.slot;
    if (!BLOCK_KEYS.includes(key)) return;

    showBlock(key, true);
    setTitle(
  key,
  block.title || block.label || block.slot
);
    setMinutes(key, block.minutes);

    total += Number(block.minutes || 0);

    const cardsTarget = getCardContainer(key);
(block.cards || []).forEach(card => {
  const enrichedCard =
    typeof card === "object"
      ? {
          ...card,
          discipline: card.discipline || session.discipline || "",
          journey: card.journey || session.journey || "",
          tier: card.tier || session.tier || ""
        }
      : {
          title: card,
          href: "",
          skill: "",
          discipline: session.discipline || "",
          journey: session.journey || "",
          tier: session.tier || ""
        };

  renderCardTitle(cardsTarget, enrichedCard);
});

    const notesEl = document.getElementById(`notes-${key}`);
    if (notesEl && block.notes && !notesEl.value) {
      notesEl.value = block.notes;
      autoGrow(notesEl);
    }
  });

  if (focusEl && session.focus && !focusEl.value) {
    focusEl.value = session.focus;
    autoGrow(focusEl);
  }

  if (totalTimeEl) {
    totalTimeEl.textContent = `Total: ${String(total).padStart(2, "0")}:00`;
  }
setStatus("Live session loaded.");
}

function getCompanionBlocks() {
  return BLOCK_KEYS
    .map(key => {
      const block = blockEls[key];

      if (!block || block.classList.contains("hidden")) {
        return null;
      }

      const cardsTarget = getCardContainer(key);

      const cards = cardsTarget
        ? [...cardsTarget.querySelectorAll(".clip-card")]
            .map(cardEl => {
              const link = cardEl.querySelector(".clip-title-link");

              return {
                title: link?.textContent?.trim() || "",
                href: link?.getAttribute("href") || "",

                skill: cardEl.dataset.skill || "",
                tier: cardEl.dataset.tier || "",
                discipline: cardEl.dataset.discipline || "",
                journey: cardEl.dataset.journey || ""
              };
            })
            .filter(card => card.title)
        : [];

      return {
        slot: key,

        label:
          document.getElementById(`title-${key}`)
            ?.textContent
            ?.trim() || key,

        minutes: Number(block.dataset.minutes || 0),

        notes:
          document.getElementById(`notes-${key}`)
            ?.value
            .trim() || "",

        cards
      };
    })
    .filter(Boolean);
}
/* =========================
   LIVE SESSION LINKS
========================= */

function getLiveSessionLinks() {
  const session = getCoachSessionPayload();

  const sessionId =
    session?.sessionId || "lompoc-mat-1";

  return {
    clock:
      `/coaches/execution/big-clock-2.0/?session=${encodeURIComponent(sessionId)}`,

    companion:
      `/coaches/execution/coach-companion/?session=${encodeURIComponent(sessionId)}`
  };
}

window.copyBigClockLink = async function () {
  try {
    const links = getLiveSessionLinks();

    await navigator.clipboard.writeText(
      window.location.origin + links.clock
    );

    setStatus("Big Clock link copied.");
  } catch (err) {
    console.error(err);
    setStatus("Copy failed.");
  }
};

window.copyCompanionLink = async function () {
  try {
    const links = getLiveSessionLinks();

    await navigator.clipboard.writeText(
      window.location.origin + links.companion
    );

    setStatus("Coach Companion link copied.");
  } catch (err) {
    console.error(err);
    setStatus("Copy failed.");
  }
};

window.openBigClock = function () {
  const links = getLiveSessionLinks();

  window.open(
    links.clock,
    "_blank"
  );
};

window.savePlan = async function () {
  try {
    const session = getCoachSessionPayload();

    await setDoc(doc(db, "practicePlans", new Date().toISOString().slice(0, 10)), {
      source: "coach-companion",

      schema:
        session?.schema ||
        session?.template ||
        session?.sessionType ||
        "",

      discipline: session?.discipline || "",
      journey: session?.journey || "",
      tier: session?.tier || "",

      coachSession: session || null,
      focus: focusEl?.value.trim() || session?.focus || "",
      blocks: getCompanionBlocks(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    setStatus("Companion notes saved.");
  } catch (err) {
    console.error(err);
    setStatus("Save failed.");
  }
};

window.clearSession = function () {
  document.querySelectorAll(".slot-notes-input").forEach(el => {
    el.value = "";
    autoGrow(el);
  });

  if (focusEl) {
    focusEl.value = "";
    autoGrow(focusEl);
  }

  setStatus("Companion notes cleared.");
};

window.endPractice = function () {
  const session = getCoachSessionPayload();

  localStorage.setItem(LAST_PRACTICE_KEY, JSON.stringify({
    source: "coach-companion",

    schema:
      session?.schema ||
      session?.template ||
      session?.sessionType ||
      "",

    discipline: session?.discipline || "",
    journey: session?.journey || "",
    tier: session?.tier || "",

    focus:
      focusEl?.value.trim() ||
      session?.focus ||
      "",

    coachSession: session || null,
    blocks: getCompanionBlocks(),
    savedAt: new Date().toISOString()
  }));

  window.location.href = "/coaches/logs/practice-log.html";
};

window.openDisciplineCards = function () {
  window.location.href = "/coaches/execution/clipboard-2.0/";
};


function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

document.addEventListener("input", e => {
  if (
    e.target.classList.contains("slot-notes-input") ||
    e.target.id === "slot-note"
  ) {
    autoGrow(e.target);
  }
});

window.addEventListener("storage", e => {

  if (!hydrationComplete) return;

  if (e.key === COACH_SESSION_KEY) {
    renderCoachSession();
  }

});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

(async function init() {
  if (typeof applyClipboardTheme === "function") {
    const savedTheme = localStorage.getItem("clipboardTheme") || "night";
    applyClipboardTheme(savedTheme);
  }

  await waitForAuth();

  await hydrateFromLiveSession();

  hydrationComplete = true;

  renderCoachSession();

  document.querySelectorAll(".slot-notes-input").forEach(autoGrow);
  if (focusEl) autoGrow(focusEl);
})();