import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  WRESTLING_FAMILIES
} from "/coaches/cards/wrestling/family-map.js";

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const athleteId = String(params.get("id") || "").trim().toUpperCase();

const skillCheckCall =
  httpsCallable(functions, "skillCheckCoachCall");

const STATES = Object.freeze([
  ["NOT_INTRODUCED", "Not Introduced"],
  ["LEARNED", "Learned"],
  ["APPLIED", "Applied"],
  ["MASTERED", "Mastered"],
  ["REFINED", "Refined"],
]);

let loadedSkills = new Map();

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function status(message, error = false) {
  const el = $("skillCheckStatus");
  if (!el) return;

  el.textContent = message;
  el.classList.toggle("is-error", error);
}

function stateOptions(selected) {
  return STATES.map(([value, label]) => `
    <option
      value="${value}"
      ${value === selected ? "selected" : ""}
    >
      ${label}
    </option>
  `).join("");
}

function renderSkills() {
  const target = $("skillFamilies");
  if (!target) return;

  const reviewOnly =
    $("reviewOnly")?.checked === true;

  const rows = Object.entries(WRESTLING_FAMILIES)
    .filter(([familyId]) => {
      if (!reviewOnly) return true;
      return loadedSkills.get(familyId)?.needsReview === true;
    })
    .map(([familyId, label]) => {
      const record =
        loadedSkills.get(familyId) || {};

      const state =
        String(record.state || "NOT_INTRODUCED")
          .toUpperCase();

      const needsReview =
        record.needsReview === true;

      return `
        <article
          class="skill-row${needsReview ? " is-review" : ""}"
          data-family="${esc(familyId)}"
        >
          <div class="skill-title">${esc(label)}</div>

          <div class="skill-controls">
            <select data-state>
              ${stateOptions(state)}
            </select>

            <textarea
              data-notes
              placeholder="Coach note — optional"
            >${esc(record.coachNotes || "")}</textarea>

            <div class="skill-actions">
              <label class="review-toggle">
                <input
                  data-review
                  type="checkbox"
                  ${needsReview ? "checked" : ""}
                />
                Needs Review
              </label>

              <button
                class="pill save-skill"
                type="button"
                data-save-family="${esc(familyId)}"
              >
                Save
              </button>
            </div>

            <div class="skill-message" data-message></div>
          </div>
        </article>
      `;
    });

  target.innerHTML = rows.length
    ? rows.join("")
    : `<p class="muted">No skill families match this filter.</p>`;
}

async function saveFamily(button) {
  const row = button.closest("[data-family]");
  if (!row) return;

  const familyId = row.dataset.family;
  const state = row.querySelector("[data-state]")?.value || "NOT_INTRODUCED";
  const needsReview =
    row.querySelector("[data-review]")?.checked === true;
  const coachNotes =
    row.querySelector("[data-notes]")?.value?.trim() || "";
  const message = row.querySelector("[data-message]");

  button.disabled = true;
  if (message) message.textContent = "Saving…";

  try {
    const result = await skillCheckCall({
      action: "save",
      athleteId,
      familyId,
      name: WRESTLING_FAMILIES[familyId] || familyId,
      state,
      needsReview,
      coachNotes,

      lastJourney:
        loadedSkills.get(familyId)?.lastJourney || "",
      lastTier:
        loadedSkills.get(familyId)?.lastTier || "",
      lastCard:
        loadedSkills.get(familyId)?.lastCard || "",
      lastCardHref:
        loadedSkills.get(familyId)?.lastCardHref || "",
    });

    loadedSkills.set(familyId, {
      ...(loadedSkills.get(familyId) || {}),
      familyId,
      name: WRESTLING_FAMILIES[familyId] || familyId,
      discipline: "wrestling",
      state,
      needsReview,
      coachNotes,
    });

    if (message) {
      message.textContent =
        result.data?.ok === true
          ? "Saved."
          : "Save completed.";
    }

    row.classList.toggle(
      "is-review",
      needsReview
    );
  } catch (error) {
    console.error("[skill-check] save failed", error);
    if (message) {
      message.textContent =
        error?.message || "Save failed.";
    }
  } finally {
    button.disabled = false;
  }
}

async function initialize() {
  if (!athleteId) {
    window.location.replace("/coaches/roster/");
    return;
  }

  try {
    const result = await skillCheckCall({
      action: "load",
      athleteId,
    });

    const data = result.data || {};
    const athlete = data.athlete || {};

    loadedSkills = new Map(
      (Array.isArray(data.skills) ? data.skills : [])
        .map((skill) => [
          String(skill.familyId || skill.id || "").trim(),
          skill,
        ])
        .filter(([familyId]) => familyId)
    );

    $("athleteName").textContent =
      athlete.name || athleteId;

    const rank =
      athlete.rankName ||
      athlete.tier ||
      "No rank";

    $("athleteMeta").textContent =
      `${athleteId} · ${rank}`;

    $("skillCheckWorkspace").hidden = false;
    status("Skill Check ready.");

    renderSkills();
  } catch (error) {
    console.error("[skill-check] load failed", error);
    status(
      error?.message ||
      "Could not load Skill Check.",
      true
    );
  }
}

$("skillFamilies")?.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest("[data-save-family]");

    if (button) {
      saveFamily(button);
    }
  }
);

$("reviewOnly")?.addEventListener(
  "change",
  renderSkills
);

initialize();
