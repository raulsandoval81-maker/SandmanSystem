const PAYLOAD_KEY = "sandman_last_practice_payload";
const LOG_KEY = "sandman_last_practice_log";

import {
  ensureSignedIn,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const payload = JSON.parse(
  localStorage.getItem(PAYLOAD_KEY) || "null"
);

/* =========================
   IMPORTANT:
   Coach Companion nests the
   original clipboard session
   inside coachSession.
========================= */

const sessionSource =
  payload?.coachSession || payload || {};

const summary = document.getElementById("sessionSummary");
const statusEl = document.getElementById("status");

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

  if (!payload) {

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
      ${escapeHtml(payload.source || "unknown")}
    </p>

    <p>
      <strong>Schema:</strong>
      ${escapeHtml(sessionSource.schema || "—")}
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
        getValue("standout")
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

  const practiceId = String(sessionSource.practiceId || payload?.practiceId || "").trim();
  if (practiceId) {
    try {
      await ensureSignedIn();
      const saveMemory = httpsCallable(functions, "savePracticeSessionMemory");
      await saveMemory({
        operation: "reflection",
        practiceId,
        reflection: {
          fearRating: log.coachReflection.fear,
          worked: log.coachReflection.worked,
          needsWork: log.coachReflection.needs,
          standout: log.coachReflection.standout
        }
      });
    } catch (error) {
      console.error("Durable practice reflection save failed", error);
      if (statusEl) statusEl.textContent = error?.message || "Saved locally; durable save failed.";
      return;
    }
  }

  if (statusEl) {
    statusEl.textContent = practiceId ? "Saved to practice memory." : "Saved locally (legacy session).";
  }
}

renderSummary();

document
  .getElementById("saveBtn")
  ?.addEventListener("click", saveLog);
