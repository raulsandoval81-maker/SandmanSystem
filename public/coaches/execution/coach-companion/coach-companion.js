import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { buildActualsSubmission, summarizeObservedExecution } from "/coaches/execution/engine/practice-execution-actuals.mjs";

const COACH_SESSION_KEY = "sandman_coach_session_v1";
const LAST_PRACTICE_KEY = "sandman_last_practice_payload";
const CLIPBOARD_DRAFT_KEY = "sandman_clipboard_draft_v1";

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
    setStatus("Sign in with your Coach account to open Daily Practice Log.");
  }
}

let activeCoachSession = null;
let hydrationComplete = false;
let canonicalPractice = null;
let actualsLocked = false;

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
    el.dataset.family = card.family || "";
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
  practiceId: String(payload.practiceId || live.practiceId || "").trim(),
  academyId: payload.academyId || "",
  roomId: payload.roomId || "",
  trainingGroups: Array.isArray(payload.trainingGroups) ? payload.trainingGroups : [],
  carryForwardNote: payload.carryForwardNote || "",

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

const NOTES_DRAFT_PREFIX = "sandman_my_practice_log_draft_v1:";
function notesDraftKey() {
  const session = getCoachSessionPayload();
  return session?.practiceId ? NOTES_DRAFT_PREFIX + session.practiceId : "";
}
const OBSERVATION_IDS = ["teamNotes", "eventNotes", "generalNotes"];
const individualNotes = {};
function observationSnapshot() {
  const notes = {};
  OBSERVATION_IDS.forEach(id => { notes[id] = document.getElementById(id)?.value || ""; });
  const selected = document.getElementById("athleteNoteSelect")?.value || "";
  if (selected) individualNotes[selected] = document.getElementById("athleteNoteText")?.value || "";
  return { ...notes, individualNotes: { ...individualNotes } };
}
function setupAthleteNotes() {
  const select = document.getElementById("athleteNoteSelect");
  const input = document.getElementById("athleteNoteText");
  if (!select || !input) return;
  const groups = getCoachSessionPayload()?.trainingGroups || [];
  const athletes = new Map();
  groups.forEach(group => {
    (group.athleteIds || []).forEach((id,index) => {
      if (id) athletes.set(String(id), String(group.athleteNames?.[index] || id));
    });
  });
  select.innerHTML = '<option value="">Choose an athlete</option>';
  athletes.forEach((name,id) => {
    const option=document.createElement("option");
    option.value=id; option.textContent=name; select.appendChild(option);
  });
  select.addEventListener("change", () => {
    input.disabled=!select.value;
    input.value=select.value ? individualNotes[select.value] || "" : "";
  });
}
function saveNotesDraft() {
  const key = notesDraftKey();
  if (!key) return;
  const notes = {};
  BLOCK_KEYS.forEach(slot => {
    notes[slot] = document.getElementById("notes-" + slot)?.value || "";
  });
  try {
    localStorage.setItem(key, JSON.stringify({
      practiceId: getCoachSessionPayload().practiceId,
      focus: focusEl?.value || "",
      notes,
      observations: observationSnapshot(),
      updatedAt: new Date().toISOString()
    }));
    setStatus("Daily Practice Log draft saved on this device.");
  } catch (error) {
    console.error("Could not save notes draft", error);
    setStatus("Notes have not been saved. Check browser storage.");
  }
}
function restoreNotesDraft() {
  const key = notesDraftKey();
  if (!key) return;
  try {
    const draft = JSON.parse(localStorage.getItem(key) || "null");
    if (!draft || draft.practiceId !== getCoachSessionPayload()?.practiceId) return;
    BLOCK_KEYS.forEach(slot => {
      const el = document.getElementById("notes-" + slot);
      if (el && typeof draft.notes?.[slot] === "string") {
        el.value = draft.notes[slot];
        autoGrow(el);
      }
    });
    const observations = draft.observations || {};
    OBSERVATION_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && typeof observations[id] === "string") el.value = observations[id];
    });
    Object.assign(individualNotes, observations.individualNotes || {});
    if (focusEl && typeof draft.focus === "string") {
      focusEl.value = draft.focus;
      autoGrow(focusEl);
    }
  } catch (error) {
    console.warn("Could not restore notes draft", error);
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
  const session = getCoachSessionPayload();

  return BLOCK_KEYS
    .map(key => {
      const block = blockEls[key];

      if (!block || block.classList.contains("hidden")) {
        return null;
      }

      const sourceBlock =
        session?.blocks?.find(item => item?.slot === key) || null;

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
                journey: cardEl.dataset.journey || "",
                family: cardEl.dataset.family || ""
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

        cards,
        drillBlocks: Array.isArray(sourceBlock?.drillBlocks)
          ? sourceBlock.drillBlocks
          : []
      };
    })
    .filter(Boolean);
}

function plannedActualsBlocks() {
  const session = getCoachSessionPayload();
  return (session?.blocks || []).map((block, index) => ({
    blockId: String(block.slot || block.blockId || block.title || `block-${index + 1}`),
    title: block.title || block.label || block.slot || "Block",
    drills: (block.drillBlocks || []).map(drill => {
      const schedule = drill.innerDrill || {};
      return {
        id: String(drill.id || ""), name: drill.name || "Drill",
        phases: Array.isArray(schedule["phases"]) ? schedule["phases"] : [],
        groupIds: Array.isArray(schedule.assignedGroupIds) ? schedule.assignedGroupIds : []
      };
    })
  }));
}

function actualsRosterOptions() {
  const groups = getCoachSessionPayload()?.trainingGroups || [];
  const athletes = new Map();
  groups.forEach(group => (group.athleteIds || []).forEach((id, index) => {
    if (id) athletes.set(String(id), String(group.athleteNames?.[index] || id));
  }));
  return { groups, athletes };
}

function renderActualsReview() {
  const target = document.getElementById("actualsRows");
  const status = document.getElementById("actualsStatus");
  if (!target || !status || !canonicalPractice) return;
  const memory = canonicalPractice.sessionMemory || {};
  const planned = plannedActualsBlocks();
  const observed = summarizeObservedExecution(planned, memory.executionObservations || []);
  const stored = memory.verifiedActuals || memory.actualsDraft || null;
  actualsLocked = Boolean(memory.verifiedActuals);
  const savedByKey = new Map((stored?.entries || []).map(entry => [`${entry.blockId}::${entry.drillId || ""}`, entry]));
  const { groups, athletes } = actualsRosterOptions();
  const groupOptions = ['<option value="">No group attribution</option>', ...groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label || group.id)}</option>`)].join("");
  const athleteOptions = ['<option value="">No athlete attribution</option>', ...[...athletes].map(([id,name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`)].join("");
  target.innerHTML = observed.map((item, index) => {
    const saved = savedByKey.get(`${item.blockId}::${item.drillId}`) || {};
    const outcome = saved.outcome || (item.status === "partial" ? "modified" : item.status === "not-observed" ? "not-observed" : item.status);
    return `<div class="actuals-row" data-actual-index="${index}" data-block-id="${escapeHtml(item.blockId)}" data-drill-id="${escapeHtml(item.drillId)}">
      <h3>${escapeHtml(item.name)}</h3>
      <p>Planned · ${escapeHtml(item.blockId)} &nbsp; | &nbsp; Observed · ${escapeHtml(item.status)}${item.elapsedSeconds ? ` at ${item.elapsedSeconds}s parent-block elapsed` : ""}. Timer evidence does not identify participants.</p>
      <label>Coach report<select data-actual-outcome ${actualsLocked ? "disabled" : ""}>${["completed","modified","skipped","not-observed"].map(value => `<option value="${value}"${value === outcome ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Performed seconds<input data-actual-seconds type="number" min="0" max="28800" step="1" value="${Number(saved.executedSeconds || 0)}" ${actualsLocked ? "disabled" : ""}></label>
      <label>Group<select data-actual-group ${actualsLocked ? "disabled" : ""}>${groupOptions}</select></label>
      <label>Athlete<select data-actual-athlete ${actualsLocked ? "disabled" : ""}>${athleteOptions}</select></label>
      <label>Short note<input data-actual-note maxlength="500" value="${escapeHtml(saved.note || "")}" ${actualsLocked ? "disabled" : ""}></label>
    </div>`;
  }).join("") || '<p>No approved practice blocks are available for actuals review.</p>';
  target.querySelectorAll(".actuals-row").forEach(row => {
    const saved = savedByKey.get(`${row.dataset.blockId}::${row.dataset.drillId || ""}`) || {};
    row.querySelector("[data-actual-group]").value = saved.groupIds?.[0] || "";
    row.querySelector("[data-actual-athlete]").value = saved.athleteIds?.[0] || "";
  });
  document.getElementById("saveActualsDraftBtn").disabled = actualsLocked;
  document.getElementById("verifyActualsBtn").disabled = actualsLocked;
  status.textContent = actualsLocked
    ? "Coach verified actuals are locked. The server recorded the verification actor and time."
    : memory.actualsDraft ? "A server-saved draft is loaded. Review and explicitly verify when ready."
      : "Review Big Clock observations, correct the Coach report, then save a draft or verify.";
}

function collectActualEntries() {
  return [...document.querySelectorAll(".actuals-row")].map(row => ({
    blockId: row.dataset.blockId, drillId: row.dataset.drillId || "", phaseId: "",
    outcome: row.querySelector("[data-actual-outcome]").value,
    executedSeconds: Number(row.querySelector("[data-actual-seconds]").value || 0),
    groupIds: [row.querySelector("[data-actual-group]").value].filter(Boolean),
    athleteIds: [row.querySelector("[data-actual-athlete]").value].filter(Boolean),
    note: row.querySelector("[data-actual-note]").value
  }));
}

async function persistActuals(operation) {
  if (actualsLocked) return;
  const practiceId = getCoachSessionPayload()?.practiceId;
  const planVersion = Number(canonicalPractice?.sessionMemory?.planVersion || 0);
  const verificationId = operation === "actuals-verify" ? `${practiceId}-${planVersion}-coach-actuals` : "";
  const submission = buildActualsSubmission({ practiceId, planVersion, entries: collectActualEntries(), verificationId });
  const save = httpsCallable(functions, "savePracticeSessionMemory");
  await save({ operation, ...submission });
  const getPractice = httpsCallable(functions, "getPracticeSession");
  canonicalPractice = (await getPractice({ practiceId })).data?.practice || canonicalPractice;
  renderActualsReview();
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

    setStatus("Daily Practice Log link copied.");
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

    await setDoc(doc(db, "practicePlans", session?.practiceId || `legacy-${new Date().toISOString().slice(0, 10)}`), {
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

async function saveSharedDailyLog() {
  const session = getCoachSessionPayload();
  if (!session?.practiceId) throw new Error("Missing practice ID.");
  const snapshot = observationSnapshot();
  const blockNotes = {};
  BLOCK_KEYS.forEach(slot => { blockNotes[slot] = document.getElementById("notes-" + slot)?.value || ""; });
  const save = httpsCallable(functions, "saveDailyPracticeLog");
  await save({ practiceId: session.practiceId, log: {
    focus: focusEl?.value || "", blockNotes,
    teamNotes: snapshot.teamNotes, eventNotes: snapshot.eventNotes,
    generalNotes: snapshot.generalNotes, individualNotes: snapshot.individualNotes
  }});
}
window.saveDailyPracticeLog = async function () {
  try {
    saveNotesDraft();
    await saveSharedDailyLog();
    setStatus("Daily Practice Log saved to the shared practice.");
  } catch (error) {
    console.error("Shared Daily Practice Log save failed", error);
    setStatus("Saved on this device only. Shared save failed: " + (error?.message || "unknown error"));
  }
};

window.endPractice = async function () {
  const button = document.querySelector("[data-end-practice-log]");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  setStatus("Preparing your practice log…");
  try {
    const session = getCoachSessionPayload();
    if (!session?.practiceId) {
      setStatus("Practice identity missing. Open the session from Big Clock before continuing.");
      return;
    }
    const record = {
      source: "coach-companion",
      schema: session.schema || session.template || session.sessionType || "",
      discipline: session.discipline || "",
      journey: session.journey || "",
      tier: session.tier || "",
      practiceId: session.practiceId,
      focus: focusEl?.value.trim() || session.focus || "",
      coachSession: session,
      blocks: getCompanionBlocks(),
      observations: observationSnapshot(),
      savedAt: new Date().toISOString()
    };
    saveNotesDraft();
    await saveSharedDailyLog();
    localStorage.setItem(LAST_PRACTICE_KEY, JSON.stringify(record));
    // Always retain the local handoff before attempting any optional cloud save.
    const draft = JSON.parse(localStorage.getItem(CLIPBOARD_DRAFT_KEY) || "null");
    if (draft?.version === 1) {
      localStorage.setItem(CLIPBOARD_DRAFT_KEY, JSON.stringify({
        ...draft, lifecycle: "completed",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }));
    }
    window.location.href = "/coaches/logs/practice-log.html?practiceId=" + encodeURIComponent(session.practiceId);
  } catch (error) {
    console.error("Daily Practice Log handoff failed", error);
    setStatus("Could not prepare the practice log. Your notes remain on this screen.");
  } finally {
    if (button) button.disabled = false;
  }
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
    e.target.id === "slot-note" ||
    OBSERVATION_IDS.includes(e.target.id) ||
    e.target.id === "athleteNoteText"
  ) {
    autoGrow(e.target);
    saveNotesDraft();
  }
});

document.getElementById("saveActualsDraftBtn")?.addEventListener("click", async () => {
  try {
    setStatus("Saving actuals draft…");
    await persistActuals("actuals-draft");
    setStatus("Actuals draft saved to the canonical practice.");
  } catch (error) {
    console.error("Actuals draft save failed", error);
    setStatus(error?.message || "Actuals draft could not be saved.");
  }
});

document.getElementById("verifyActualsBtn")?.addEventListener("click", async () => {
  if (!window.confirm("Verify these actuals? Verified evidence is locked and cannot be overwritten.")) return;
  try {
    setStatus("Verifying actuals…");
    await persistActuals("actuals-verify");
    setStatus("Coach actuals verified. No XP, attendance, mastery, or closeout action was performed.");
  } catch (error) {
    console.error("Actuals verification failed", error);
    setStatus(error?.message || "Actuals could not be verified.");
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
  setupAthleteNotes();
  restoreNotesDraft();
  // Hydrate shared notes on this device; local unsent work stays as fallback.
  const practiceId = getCoachSessionPayload()?.practiceId;
  if (practiceId) {
    try {
      const getPractice = httpsCallable(functions, "getPracticeSession");
      const response = await getPractice({ practiceId });
      canonicalPractice = response.data?.practice || null;
      renderActualsReview();
      const shared = canonicalPractice?.dailyPracticeLog;
      if (shared && !localStorage.getItem(notesDraftKey())) {
        BLOCK_KEYS.forEach(slot => {
          const el = document.getElementById("notes-" + slot);
          if (el && typeof shared.blockNotes?.[slot] === "string") el.value = shared.blockNotes[slot];
        });
        if (focusEl) focusEl.value = shared.focus || "";
        OBSERVATION_IDS.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = shared[id] || "";
        });
        Object.assign(individualNotes, shared.individualNotes || {});
        setStatus("Shared Daily Practice Log loaded.");
      }
    } catch (error) {
      console.warn("Shared log retrieval failed", error);
      setStatus("Shared log unavailable. Local notes remain available.");
    }
  }


  document.querySelectorAll(".slot-notes-input").forEach(autoGrow);
  if (focusEl) autoGrow(focusEl);
})();
