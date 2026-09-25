const PAYLOAD_KEY = "sandman_last_practice_payload";
const LOG_KEY = "sandman_last_practice_log";

import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { coachLoginUrl, isCoachAuthenticationError, requireCoach } from "/assets/js/coach-guard.js?v=2";

let payload = JSON.parse(
  localStorage.getItem(PAYLOAD_KEY) || "null"
);

/* =========================
   IMPORTANT:
   Coach Companion nests the
   original clipboard session
   inside coachSession.
========================= */

let sessionSource =
  payload?.coachSession || payload || {};

const params = new URLSearchParams(window.location.search);
const requestedPracticeId = String(
  params.get("practiceId") || params.get("practice") || sessionSource.practiceId || payload?.practiceId || ""
).trim();
let canonicalPractice = null;
let canonicalAttendance = null;
let canonicalRoster = [];
let canonicalAthleteInputs = {};

const summary = document.getElementById("sessionSummary");
const statusEl = document.getElementById("status");
const athleteInputEl = document.getElementById("athleteInput");
const closeBtn = document.getElementById("closeBtn");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWeekKey(date = new Date()) {
  const d = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );

  const dayNum = d.getUTCDay() || 7;

  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(
    Date.UTC(d.getUTCFullYear(), 0, 1)
  );

  const weekNo = Math.ceil(
    (((d - yearStart) / 86400000) + 1) / 7
  );

  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getBlocks() {
  if (canonicalPractice) {
    const memory = canonicalPractice.sessionMemory || {};
    return Array.isArray(memory.workedBlocks) ? memory.workedBlocks : [];
  }
  return Array.isArray(payload?.blocks)
    ? payload.blocks
    : [];
}

function getCardsFromBlocks(blocks) {

  return blocks.flatMap(block => {

    const cards = Array.isArray(block.cards)
      ? block.cards
      : [];

    return cards.map(card => {

      if (typeof card === "string") {

        return {
          title: card,
          href: "",

          slot: block.slot || "",

          block:
            block.label ||
            block.title ||
            block.slot ||
            ""
        };
      }

      return {
        title: card.title || "",
        href: card.href || "",

        skill: card.skill || "",

        discipline:
          card.discipline ||
          sessionSource.discipline ||
          "",

        journey:
          card.journey ||
          sessionSource.journey ||
          "",

        tier:
          card.tier ||
          sessionSource.tier ||
          "",

        slot: block.slot || "",

        block:
          block.label ||
          block.title ||
          block.slot ||
          ""
      };

    });

  }).filter(card => card.title);
}

function getSkillsFromCards(cards) {

  const seen = new Set();

  return cards
    .filter(card => card.skill || card.title)

    .map(card => ({
      skill: card.skill || "",
      title: card.title || "",

      discipline: card.discipline || "",
      journey: card.journey || "",
      tier: card.tier || ""
    }))

    .filter(item => {

      const key =
        `${item.skill}|${item.title}|${item.discipline}|${item.journey}|${item.tier}`;

      if (seen.has(key)) return false;

      seen.add(key);

      return true;
    });
}

function getStructure(blocks) {

  const totalMinutes =
    blocks.reduce(
      (sum, b) => sum + Number(b.minutes || 0),
      0
    );

  const liveMinutes =
    blocks
      .filter(
        b => (b.slot || "").toLowerCase() === "live"
      )
      .reduce(
        (sum, b) => sum + Number(b.minutes || 0),
        0
      );

  const conditioningMinutes =
    blocks
      .filter(b =>
        ["cond", "conditioning"]
          .includes((b.slot || "").toLowerCase())
      )
      .reduce(
        (sum, b) => sum + Number(b.minutes || 0),
        0
      );

  return {
    totalMinutes,
    liveMinutes,
    conditioningMinutes,

    blocks: blocks.map(b => ({
      slot: b.slot || "",

      label:
        b.label ||
        b.title ||
        b.slot ||
        "",

      minutes: Number(b.minutes || 0),

      notes: b.notes || ""
    }))
  };
}

function renderSummary() {

  if (!summary) return;

  if (!payload && !canonicalPractice) {

    summary.innerHTML = `
      <p class="muted">
        No session payload found.
      </p>
    `;

    return;
  }

  const blocks = getBlocks();

  const cards =
    getCardsFromBlocks(blocks);

  const structure =
    getStructure(blocks);

  summary.innerHTML = `

    <p>
      <strong>Source:</strong>
      ${escapeHtml(canonicalPractice ? "canonical practice" : payload.source || "unknown")}
    </p>

    <p>
      <strong>Schema:</strong>
      ${escapeHtml(sessionSource.schema || canonicalPractice?.entryMode || "—")}
    </p>

    <p>
  <strong>Track:</strong>
  ${escapeHtml(sessionSource.track || "—")}
</p>

    <p>
      <strong>Discipline:</strong>
      ${escapeHtml(sessionSource.discipline || "—")}
    </p>

    <p>
      <strong>Journey:</strong>
      ${escapeHtml(sessionSource.journey || "—")}
    </p>

    <p>
      <strong>Tier:</strong>
      ${escapeHtml(sessionSource.tier || "—")}
    </p>


    <p>
      <strong>Total:</strong>
      ${structure.totalMinutes} min
      ·
      <strong>Live:</strong>
      ${structure.liveMinutes} min
      ·
      <strong>Conditioning:</strong>
      ${structure.conditioningMinutes} min
    </p>

    ${canonicalPractice ? `
      <p><strong>Practice:</strong> ${escapeHtml(requestedPracticeId)}</p>
      <p><strong>Date:</strong> ${escapeHtml(canonicalAttendance?.sessionDateKey || canonicalPractice.sessionDateKey || "—")}</p>
      <p><strong>Status:</strong> ${escapeHtml(canonicalPractice.status || "—")} · <strong>Verified:</strong> ${Array.isArray(canonicalAttendance?.presentIds) ? canonicalAttendance.presentIds.length : 0}</p>
    ` : ""}

    <h3>Blocks</h3>

    <ul>
      ${structure.blocks.map(b => `
        <li>

          <strong>
            ${escapeHtml(b.label)}
          </strong>

          — ${b.minutes} min

          ${
            b.notes
              ? `<br><span class="muted">${escapeHtml(b.notes)}</span>`
              : ""
          }

        </li>
      `).join("")}
    </ul>

    <h3>Cards / Skills Used</h3>

    ${
      cards.length

        ? `<ul>

            ${cards.map(card => `

              <li>

                ${
                  card.href

                    ? `
                      <a
                        href="${escapeHtml(card.href)}"
                        target="_blank"
                        rel="noopener"
                      >
                        ${escapeHtml(card.title)}
                      </a>
                    `

                    : escapeHtml(card.title)
                }

                ${
                  card.tier
                    ? `<span class="muted"> · ${escapeHtml(card.tier)}</span>`
                    : ""
                }

              </li>

            `).join("")}

          </ul>`

        : `
          <p class="muted">
            No session concepts captured.
          </p>
        `
    }
  `;
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function setValue(id, next) {
  const element = document.getElementById(id);
  if (element) element.value = String(next || "");
}

function renderAthleteInputs() {
  if (!athleteInputEl) return;
  const presentIds = Array.isArray(canonicalAttendance?.presentIds)
    ? canonicalAttendance.presentIds.map(String) : [];
  const roster = new Map(canonicalRoster.map((athlete) => [String(athlete.id), athlete]));
  if (!presentIds.length) {
    athleteInputEl.innerHTML = `<p class="muted">No verified participants for this practice.</p>`;
    return;
  }
  athleteInputEl.innerHTML = presentIds.map((athleteId) => {
    const athlete = roster.get(athleteId) || {};
    const input = canonicalAthleteInputs[athleteId] || {};
    return `<article class="athlete-input" data-athlete-id="${escapeHtml(athleteId)}">
      <h3>${escapeHtml(athlete.name || athlete.fullName || athlete.publicName || athleteId)}</h3>
      <label>Coach Observation</label>
      <textarea data-field="coachObservation" placeholder="Individual practice observation">${escapeHtml(input.coachObservation || "")}</textarea>
      <label>Development Note</label>
      <textarea data-field="developmentNote" placeholder="Optional next development focus">${escapeHtml(input.developmentNote || "")}</textarea>
    </article>`;
  }).join("");
}

async function loadCanonicalPractice() {
  if (!requestedPracticeId || requestedPracticeId.includes("/")) return;
  const getReview = httpsCallable(functions, "getPracticeAttendanceReview");
  const response = await getReview({ practiceId: requestedPracticeId });
  canonicalPractice = response.data?.practice || null;
  canonicalAttendance = response.data?.attendance || null;
  canonicalRoster = Array.isArray(response.data?.roster) ? response.data.roster : [];
  canonicalAthleteInputs = response.data?.athleteInputs || {};
  if (!canonicalPractice) throw new Error("Canonical practice not found.");
  payload = payload || { source: "canonical-practice", blocks: [] };
  sessionSource = {
    ...sessionSource,
    practiceId: requestedPracticeId,
    discipline: canonicalPractice.discipline || "",
    journey: canonicalPractice.journey || "",
    track: canonicalPractice.program || "",
    schema: canonicalPractice.entryMode || "normal",
  };
  const reflection = canonicalPractice.sessionMemory?.reflection || {};
  setValue("fear", reflection.fearRating);
  setValue("worked", reflection.worked);
  setValue("needs", reflection.needsWork);
  setValue("standout", reflection.standout);
  setValue("coachNote", reflection.coachNote);
  renderAthleteInputs();
  if (closeBtn) closeBtn.hidden = canonicalPractice.status === "closed";
}

async function saveLog() {

  const blocks = getBlocks();

  const cards =
    getCardsFromBlocks(blocks);

  const skills =
    getSkillsFromCards(cards);

  const structure =
    getStructure(blocks);

  const now = new Date();

  const log = {

    logType: "practice",

    session: {

      date:
        now.toISOString().slice(0, 10),

      source:
        payload?.source || "unknown",

      schema:
        sessionSource.schema || "",

         track:
    sessionSource.track || "",

      discipline:
        sessionSource.discipline || "",

      journey:
        sessionSource.journey || "",

      tier:
        sessionSource.tier || "",

      tierWeek:
        getValue("tierWeek"),
    },

    structure,

    cards,

    skills,

    coachReflection: {

      fear: getValue("fear"),

      worked:
        getValue("worked"),

      needs:
        getValue("needs"),

      standout:
        getValue("standout"),

      coachNote:
        getValue("coachNote")
    },

    athleteFeedbackSeeds: {

      teamNeedsWork:
        getValue("needs")
          ? [getValue("needs")]
          : [],

      individualNeedsWork: []
    },

    tracking: {

      weekKey:
        getWeekKey(now),

      savedAt:
        now.toISOString()
    },

    rawPayload:
      payload || null
  };

  localStorage.setItem(
    LOG_KEY,
    JSON.stringify(log)
  );

  const practiceId = String(requestedPracticeId || sessionSource.practiceId || payload?.practiceId || "").trim();
  if (practiceId) {
    try {
      const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
      await saveMemory({
        operation: "reflection",
        practiceId,
        reflection: {
          fearRating: log.coachReflection.fear,
          worked: log.coachReflection.worked,
          needsWork: log.coachReflection.needs,
          standout: log.coachReflection.standout,
          coachNote: log.coachReflection.coachNote
        }
      });
      if (canonicalPractice) {
        const saveAthleteInput = httpsCallable(functions, "savePracticeAthleteInput");
        const cards = [...document.querySelectorAll("[data-athlete-id]")];
        await Promise.all(cards.map((card) => saveAthleteInput({
          practiceId,
          athleteId: card.dataset.athleteId,
          coachObservation: card.querySelector('[data-field="coachObservation"]')?.value.trim() || "",
          developmentNote: card.querySelector('[data-field="developmentNote"]')?.value.trim() || "",
        })));
      }
    } catch (error) {
      console.error("Durable practice reflection save failed", error);
      if (statusEl) statusEl.textContent = error?.message || "Saved locally; durable save failed.";
      return;
    }
  }

  if (statusEl) {
    statusEl.textContent = practiceId ? "Saved practice and athlete input." : "Saved locally (legacy session).";
  }
}

async function finalClose() {
  if (!canonicalPractice || !requestedPracticeId) throw new Error("A canonical practice is required for final close.");
  const closePractice = httpsCallable(functions, "closePracticeSession");
  const response = await closePractice({
    practiceId: requestedPracticeId,
    attendanceSessionId: requestedPracticeId,
  });
  canonicalPractice.status = response.data?.status || "closed";
  if (closeBtn) closeBtn.hidden = true;
  renderSummary();
  if (statusEl) statusEl.textContent = response.data?.idempotent ? "Practice was already closed." : "Practice closed.";
}

async function initializePracticeLog() {
  try {
    await requireCoach();
    await loadCanonicalPractice();
    renderSummary();
    if (statusEl) statusEl.textContent = canonicalPractice ? "Canonical practice loaded." : "Legacy local practice loaded.";
  } catch (error) {
    console.error("Practice Log initialization failed", error);
    if (isCoachAuthenticationError(error)) {
      window.location.replace(coachLoginUrl());
      return;
    }
    if (statusEl) statusEl.textContent = error?.message || "Unable to load practice.";
  }
}

document
  .getElementById("saveBtn")
  ?.addEventListener("click", () => {
    saveLog().catch((error) => {
      console.error("Practice Log save failed", error);
      if (statusEl) statusEl.textContent = error?.message || "Unable to save practice input.";
    });
  });

closeBtn?.addEventListener("click", () => {
  finalClose().catch((error) => {
    console.error("Practice final close failed", error);
    if (statusEl) statusEl.textContent = error?.message || "Unable to close practice.";
  });
});

initializePracticeLog();
