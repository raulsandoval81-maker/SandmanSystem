import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const $ = (id) =>
  document.getElementById(id);

const listPins =
  httpsCallable(
    functions,
    "listAthleteAssessmentPins"
  );

const returnPin =
  httpsCallable(
    functions,
    "returnAthleteAssessmentPin"
  );

const OPEN_STATUSES =
  new Set([
    "ASSESSMENT_NEEDED",
    "IN_ASSESSMENT"
  ]);

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clean(value) {
  return String(value ?? "").trim();
}

function xpForExperience(value) {
  const years = Number(value || 0);

  if (years === 1) return 200;
  if (years === 2) return 400;
  if (years >= 3) return 600;

  return 0;
}

function statusLabel(status) {
  const normalized =
    clean(status).toUpperCase();

  if (
    normalized ===
    "ASSESSMENT_NEEDED"
  ) {
    return "Assessment Needed";
  }

  if (
    normalized ===
    "IN_ASSESSMENT"
  ) {
    return "In Assessment";
  }

  return normalized
    .replaceAll("_", " ");
}

function fearField(
  pinId,
  key,
  label
) {
  return `
    <label class="assessment-field">
      <span>${esc(label)}</span>

      <select
        data-fear="${esc(key)}"
        data-pin="${esc(pinId)}"
      >
        <option value="">
          Select…
        </option>

        <option value="meets">
          Meets Standard
        </option>

        <option value="developing">
          Developing
        </option>

        <option value="concern">
          Concern
        </option>
      </select>
    </label>
  `;
}

function renderPin(pin) {
  const pinId =
    clean(pin.id);

  const athleteUid =
    clean(pin.athleteUid);

  const athleteName =
    clean(pin.athleteName) ||
    athleteUid;

  const locationId =
    clean(pin.locationId) ||
    "—";

  const discipline =
    clean(pin.discipline) ||
    "—";

  const program =
    clean(pin.program) ||
    "—";

  const currentXp =
    Math.max(
      0,
      Number(
        pin.currentEarnedXp || 0
      )
    );

  return `
    <article
      class="assessment-card"
      data-assessment-card="${esc(pinId)}"
    >

      <div class="assessment-card-head">
        <div>
          <span class="assessment-pill">
            ${esc(
              statusLabel(
                pin.status
              )
            )}
          </span>

          <h3>
            ${esc(athleteName)}
          </h3>

          <p class="assessment-meta">
            ${esc(athleteUid)}
            ·
            ${esc(locationId)}
          </p>

          <p class="assessment-meta">
            ${esc(discipline)}
            ·
            ${esc(program)}
          </p>
        </div>

        <div class="assessment-xp-box">
          <span>Current Earned XP</span>
          <strong>${esc(currentXp)}</strong>
          <small>
            Normal practice XP stays earned.
          </small>
        </div>
      </div>

      <div class="assessment-divider"></div>

      <section>
        <p class="assessment-eyebrow">
          FEAR Review
        </p>

        <h4>
          Focus · Effort · Attitude · Respect
        </h4>

        <div class="assessment-grid assessment-grid--four">
          ${fearField(
            pinId,
            "focus",
            "Focus"
          )}

          ${fearField(
            pinId,
            "effort",
            "Effort"
          )}

          ${fearField(
            pinId,
            "attitude",
            "Attitude"
          )}

          ${fearField(
            pinId,
            "respect",
            "Respect"
          )}
        </div>
      </section>

      <div class="assessment-divider"></div>

      <section>
        <p class="assessment-eyebrow">
          Prior Experience
        </p>

        <h4>
          Coach Verification
        </h4>

        <div class="assessment-grid assessment-grid--two">

          <label class="assessment-field">
            <span>
              Verified Experience
            </span>

            <select
              data-experience-mode
              data-pin="${esc(pinId)}"
            >
              <option value="0">
                None — 0 XP
              </option>

              <option value="1">
                1 Year — 200 XP
              </option>

              <option value="2">
                2 Years — 400 XP
              </option>

              <option value="3">
                3+ Years — 600 XP
              </option>

              <option value="manual">
                Manual Edge Case
              </option>
            </select>
          </label>

          <div class="assessment-recognition">
            <span>
              Prior-Experience Recognition
            </span>

            <strong
              data-recognition-xp="${esc(pinId)}"
            >
              0 XP
            </strong>

            <small>
              Separate from earned practice XP.
            </small>
          </div>

        </div>

        <div
          class="assessment-manual"
          data-manual-area="${esc(pinId)}"
          hidden
        >
          <label class="assessment-field">
            <span>
              Manual Recognition XP
            </span>

            <input
              data-manual-xp
              data-pin="${esc(pinId)}"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              placeholder="Enter XP"
            >
          </label>

          <label class="assessment-field">
            <span>
              Required Edge-Case Note
            </span>

            <textarea
              data-experience-note
              data-pin="${esc(pinId)}"
              rows="3"
              placeholder="Explain why the normal 200 / 400 / 600 rule does not fit."
            ></textarea>
          </label>
        </div>
      </section>

      <div class="assessment-divider"></div>

      <section>
        <p class="assessment-eyebrow">
          Placement
        </p>

        <div class="assessment-grid assessment-grid--two">

          <label class="assessment-field">
            <span>
              Placement Recommendation
            </span>

            <input
              data-placement
              data-pin="${esc(pinId)}"
              type="text"
              placeholder="Example: Apprentice · T0"
            >
          </label>

          <label class="assessment-field">
            <span>
              Coach Notes
            </span>

            <textarea
              data-coach-notes
              data-pin="${esc(pinId)}"
              rows="3"
              placeholder="Assessment findings, readiness, concerns, or context."
            ></textarea>
          </label>

        </div>
      </section>

      <div class="assessment-return">
        <p
          class="assessment-card-status"
          data-card-status="${esc(pinId)}"
          role="status"
          aria-live="polite"
        ></p>

        <button
          class="assessment-button assessment-button--primary"
          type="button"
          data-return-assessment="${esc(pinId)}"
        >
          Return to Management
        </button>
      </div>

    </article>
  `;
}

function wireExperienceControls() {
  document
    .querySelectorAll(
      "[data-experience-mode]"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        () => {
          const pinId =
            clean(select.dataset.pin);

          const value =
            clean(select.value);

          const manualArea =
            document.querySelector(
              `[data-manual-area="${CSS.escape(
                pinId
              )}"]`
            );

          const recognition =
            document.querySelector(
              `[data-recognition-xp="${CSS.escape(
                pinId
              )}"]`
            );

          const isManual =
            value === "manual";

          if (manualArea) {
            manualArea.hidden =
              !isManual;
          }

          if (recognition) {
            recognition.textContent =
              isManual
                ? "Manual"
                : `${xpForExperience(
                    value
                  )} XP`;
          }
        }
      );
    });

  document
    .querySelectorAll(
      "[data-manual-xp]"
    )
    .forEach((input) => {
      input.addEventListener(
        "input",
        () => {
          const pinId =
            clean(input.dataset.pin);

          const recognition =
            document.querySelector(
              `[data-recognition-xp="${CSS.escape(
                pinId
              )}"]`
            );

          if (!recognition) return;

          const amount =
            Math.max(
              0,
              Number(
                input.value || 0
              )
            );

          recognition.textContent =
            `${Math.floor(amount)} XP`;
        }
      );
    });
}

function valueFor(
  selector,
  pinId
) {
  return clean(
    document.querySelector(
      `${selector}[data-pin="${CSS.escape(
        pinId
      )}"]`
    )?.value
  );
}

async function submitAssessment(
  pinId,
  button
) {
  const statusEl =
    document.querySelector(
      `[data-card-status="${CSS.escape(
        pinId
      )}"]`
    );

  const originalLabel =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "Returning…";

  if (statusEl) {
    statusEl.textContent = "";
  }

  try {
    const focus =
      valueFor(
        '[data-fear="focus"]',
        pinId
      );

    const effort =
      valueFor(
        '[data-fear="effort"]',
        pinId
      );

    const attitude =
      valueFor(
        '[data-fear="attitude"]',
        pinId
      );

    const respect =
      valueFor(
        '[data-fear="respect"]',
        pinId
      );

    if (
      !focus ||
      !effort ||
      !attitude ||
      !respect
    ) {
      throw new Error(
        "Complete all four FEAR findings."
      );
    }

    const experienceSelection =
      valueFor(
        "[data-experience-mode]",
        pinId
      );

    const placementRecommendation =
      valueFor(
        "[data-placement]",
        pinId
      );

    if (!placementRecommendation) {
      throw new Error(
        "Placement recommendation is required."
      );
    }

    const coachNotes =
      valueFor(
        "[data-coach-notes]",
        pinId
      );

    const payload = {
      pinId,

      fear: {
        focus,
        effort,
        attitude,
        respect
      },

      placementRecommendation,

      coachNotes
    };

    if (
      experienceSelection ===
      "manual"
    ) {
      const manualXpRaw =
        valueFor(
          "[data-manual-xp]",
          pinId
        );

      const experienceNote =
        valueFor(
          "[data-experience-note]",
          pinId
        );

      if (
        manualXpRaw === ""
      ) {
        throw new Error(
          "Enter the manual prior-experience XP amount."
        );
      }

      const manualXp =
        Number(manualXpRaw);

      if (
        !Number.isInteger(
          manualXp
        ) ||
        manualXp < 0
      ) {
        throw new Error(
          "Manual XP must be a whole number of 0 or more."
        );
      }

      if (!experienceNote) {
        throw new Error(
          "Manual prior-experience XP requires an edge-case note."
        );
      }

      payload.experienceMode =
        "manual";

      payload.manualExperienceXp =
        manualXp;

      payload.experienceNote =
        experienceNote;
    } else {
      payload.experienceMode =
        "standard";

      payload.verifiedExperienceYears =
        Number(
          experienceSelection || 0
        );
    }

    const response =
      await returnPin(payload);

    if (
      response?.data?.status !==
      "RETURNED_TO_MANAGEMENT"
    ) {
      throw new Error(
        "Assessment return did not complete."
      );
    }

    if (statusEl) {
      statusEl.textContent =
        "Returned to Management.";
    }

    const card =
      document.querySelector(
        `[data-assessment-card="${CSS.escape(
          pinId
        )}"]`
      );

    if (card) {
      card.classList.add(
        "assessment-card--complete"
      );

      setTimeout(() => {
        card.remove();
        updateEmptyState();
      }, 650);
    }
  } catch (error) {
    console.error(
      "Athlete Assessment return failed:",
      error
    );

    if (statusEl) {
      statusEl.textContent =
        error?.message ||
        "Unable to return assessment.";
    }

    button.disabled = false;
    button.textContent =
      originalLabel;
  }
}

function wireReturnButtons() {
  document
    .querySelectorAll(
      "[data-return-assessment]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const pinId =
            clean(
              button.dataset
                .returnAssessment
            );

          if (!pinId) return;

          submitAssessment(
            pinId,
            button
          );
        }
      );
    });
}

function updateEmptyState() {
  const list =
    $("assessmentList");

  const status =
    $("assessmentStatus");

  if (!list || !status) return;

  const remaining =
    list.querySelectorAll(
      "[data-assessment-card]"
    ).length;

  if (remaining === 0) {
    list.innerHTML = `
      <div class="assessment-empty">
        No Coach assessments are waiting.
      </div>
    `;

    status.textContent =
      "Assessment queue is clear.";
  }
}

async function loadAssessments() {
  const list =
    $("assessmentList");

  const status =
    $("assessmentStatus");

  if (!list || !status) return;

  status.textContent =
    "Loading assessments…";

  list.innerHTML = "";

  try {
    const response =
      await listPins({});

    const allPins =
      Array.isArray(
        response?.data?.pins
      )
        ? response.data.pins
        : [];

    const pins =
      allPins.filter((pin) =>
        OPEN_STATUSES.has(
          clean(pin.status)
            .toUpperCase()
        )
      );

    if (!pins.length) {
      list.innerHTML = `
        <div class="assessment-empty">
          No Coach assessments are waiting.
        </div>
      `;

      status.textContent =
        "Assessment queue is clear.";

      return;
    }

    list.innerHTML =
      pins
        .map(renderPin)
        .join("");

    status.textContent =
      `${pins.length} assessment${
        pins.length === 1
          ? ""
          : "s"
      } waiting.`;

    wireExperienceControls();
    wireReturnButtons();
  } catch (error) {
    console.error(
      "Unable to load Athlete Assessments:",
      error
    );

    status.textContent =
      error?.message ||
      "Unable to load assessments.";

    list.innerHTML = `
      <div class="assessment-empty assessment-empty--error">
        Athlete Assessment could not be loaded.
      </div>
    `;
  }
}

$("refreshAssessments")
  ?.addEventListener(
    "click",
    loadAssessments
  );

loadAssessments();
