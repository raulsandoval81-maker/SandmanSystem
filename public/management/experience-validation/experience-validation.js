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

const finalizeExperience =
  httpsCallable(
    functions,
    "finalizeExperienceValidation"
  );

const REVIEWABLE_STATUSES =
  new Set([
    "RETURNED_TO_MANAGEMENT",
    "PLACEMENT_RECORDED"
  ]);

function clean(value) {
  return String(value ?? "").trim();
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function experiencePlan(
  priorExperience = {}
) {
  if (
    priorExperience.manual === true
  ) {
    const total =
      Math.max(
        0,
        Number(
          priorExperience.manualXp ??
          priorExperience.recognitionXp ??
          0
        )
      );

    return {
      label: "Manual Coach Recommendation",
      total,
      now: total,
      held: 0,
      schedule: "None"
    };
  }

  const years =
    Number(
      priorExperience.verifiedYears ||
      0
    );

  if (years === 1) {
    return {
      label: "1 Year Verified",
      total: 200,
      now: 200,
      held: 0,
      schedule: "None"
    };
  }

  if (years === 2) {
    return {
      label: "2 Years Verified",
      total: 400,
      now: 200,
      held: 200,
      schedule: "Tier 1 entry"
    };
  }

  if (years >= 3) {
    return {
      label: "3+ Years Verified",
      total: 600,
      now: 300,
      held: 300,
      schedule: "Tier 1 entry"
    };
  }

  return {
    label: "No Prior Experience",
    total: 0,
    now: 0,
    held: 0,
    schedule: "None"
  };
}

function statusLabel(value) {
  const status =
    clean(value).toUpperCase();

  if (
    status === "RETURNED_TO_MANAGEMENT"
  ) {
    return "Returned by Coach";
  }

  if (
    status === "PLACEMENT_RECORDED"
  ) {
    return "Placement Recorded";
  }

  return (
    status.replaceAll("_", " ") ||
    "Returned Assessment"
  );
}

function fearSummary(fear = {}) {
  return [
    ["Focus", fear.focus],
    ["Effort", fear.effort],
    ["Attitude", fear.attitude],
    ["Respect", fear.respect]
  ]
    .map(([label, value]) =>
      `${label}: ${
        clean(value) || "—"
      }`
    )
    .join(" · ");
}

function renderPin(pin) {
  const pinId =
    clean(pin.id);

  const athleteUid =
    clean(pin.athleteUid);

  const athleteName =
    clean(pin.athleteName) ||
    athleteUid ||
    "Athlete";

  const locationId =
    clean(pin.locationId) ||
    "—";

  const discipline =
    clean(pin.discipline) ||
    "—";

  const program =
    clean(pin.program) ||
    "—";

  const priorExperience =
    pin.priorExperience &&
    typeof pin.priorExperience ===
      "object"
      ? pin.priorExperience
      : {};

  const plan =
    experiencePlan(
      priorExperience
    );

  const currentXp =
    Math.max(
      0,
      Number(
        pin.currentEarnedXp || 0
      )
    );

  const placement =
    clean(
      pin.placementRecommendation
    ) || "—";

  const coachNotes =
    clean(pin.coachNotes) ||
    "No additional Coach notes.";

  const experienceNote =
    clean(
      priorExperience.note
    );

  return `
    <article
      class="experience-card"
      data-pin-card="${esc(pinId)}"
    >

      <div class="experience-card__head">

        <div>
          <span class="experience-pill">
            ${esc(
              statusLabel(
                pin.status
              )
            )}
          </span>

          <h3>
            ${esc(athleteName)}
          </h3>

          <p class="experience-meta">
            ${esc(athleteUid)}
            ·
            ${esc(locationId)}
          </p>

          <p class="experience-meta">
            ${esc(discipline)}
            ·
            ${esc(program)}
          </p>
        </div>

        <div class="experience-xp">
          <span>
            Current Earned XP
          </span>

          <strong>
            ${esc(currentXp)}
          </strong>

          <small>
            Existing earned XP remains intact.
          </small>
        </div>

      </div>

      <div class="experience-card__body">

        <div class="experience-grid">

          <div class="experience-box">
            <span>
              Coach Verification
            </span>

            <strong>
              ${esc(plan.label)}
            </strong>

            ${
              experienceNote
                ? `
                  <small>
                    ${esc(experienceNote)}
                  </small>
                `
                : ""
            }
          </div>

          <div class="experience-box">
            <span>
              Recognition Total
            </span>

            <strong>
              ${esc(plan.total)} XP
            </strong>

            <small>
              Total prior-experience recognition.
            </small>
          </div>

          <div class="experience-box">
            <span>
              Issue Now
            </span>

            <strong>
              ${esc(plan.now)} XP
            </strong>

            <small>
              Added to active-rank XP now.
            </small>
          </div>

          <div class="experience-box">
            <span>
              Held Credit
            </span>

            <strong>
              ${esc(plan.held)} XP
            </strong>

            <small>
              ${
                plan.held > 0
                  ? `Released at ${esc(
                      plan.schedule
                    )}.`
                  : "No deferred credit."
              }
            </small>
          </div>

          <div class="experience-box">
            <span>
              FEAR
            </span>

            <strong>
              Coach Review
            </strong>

            <small>
              ${esc(
                fearSummary(
                  pin.fear || {}
                )
              )}
            </small>
          </div>

          <div class="experience-box">
            <span>
              Placement Recommendation
            </span>

            <strong>
              ${esc(placement)}
            </strong>

            <small>
              ${esc(coachNotes)}
            </small>
          </div>

        </div>

        <div class="experience-review">

          <label
            for="management-note-${esc(pinId)}"
          >
            Management Note
          </label>

          <textarea
            id="management-note-${esc(pinId)}"
            data-management-note="${esc(pinId)}"
            placeholder="Optional Management review note."
          ></textarea>

          <p
            class="experience-status"
            data-card-status="${esc(pinId)}"
            role="status"
            aria-live="polite"
          ></p>

          <div class="experience-actions">

            <button
              class="button button-secondary"
              type="button"
              data-reject-pin="${esc(pinId)}"
            >
              Reject Recognition
            </button>

            <button
              class="button"
              type="button"
              data-approve-pin="${esc(pinId)}"
            >
              Approve Recognition
            </button>

          </div>

        </div>

      </div>

    </article>
  `;
}

function setPageStatus(message) {
  const node =
    $("pageStatus");

  if (node) {
    node.textContent =
      message;
  }
}

function setCardStatus(
  pinId,
  message
) {
  const node =
    document.querySelector(
      `[data-card-status="${CSS.escape(
        pinId
      )}"]`
    );

  if (node) {
    node.textContent =
      message;
  }
}

function setCardBusy(
  pinId,
  busy
) {
  const card =
    document.querySelector(
      `[data-pin-card="${CSS.escape(
        pinId
      )}"]`
    );

  card
    ?.querySelectorAll("button")
    .forEach((button) => {
      button.disabled =
        busy;
    });
}

async function loadPins() {
  const list =
    $("experienceList");

  if (!list) return;

  setPageStatus(
    "Loading returned assessments..."
  );

  list.innerHTML = "";

  try {
    const response =
      await listPins({});

    const pins =
      Array.isArray(
        response.data?.pins
      )
        ? response.data.pins
        : [];

    const reviewable =
      pins.filter((pin) => {
        const status =
          clean(pin.status)
            .toUpperCase();

        const recognitionStatus =
          clean(
            pin.experienceRecognitionStatus
          ).toUpperCase();

        return (
          REVIEWABLE_STATUSES.has(
            status
          ) &&
          recognitionStatus !==
            "AWARDED" &&
          recognitionStatus !==
            "REJECTED"
        );
      });

    if (!reviewable.length) {
      list.innerHTML = `
        <div class="experience-empty">
          No returned Coach assessments
          are waiting for experience validation.
        </div>
      `;

      setPageStatus(
        "No experience validations pending."
      );

      return;
    }

    list.innerHTML =
      reviewable
        .map(renderPin)
        .join("");

    setPageStatus(
      `${reviewable.length} experience validation${
        reviewable.length === 1
          ? ""
          : "s"
      } pending.`
    );

  } catch (error) {
    console.error(
      "Could not load experience validations:",
      error
    );

    setPageStatus(
      error?.message ||
      "Could not load experience validations."
    );
  }
}

async function finalizePin(
  pinId,
  decision
) {
  const note =
    clean(
      document.querySelector(
        `[data-management-note="${CSS.escape(
          pinId
        )}"]`
      )?.value
    );

  const verb =
    decision === "approve"
      ? "approve"
      : "reject";

  const confirmed =
    window.confirm(
      `Are you sure you want to ${verb} this prior-experience recognition?`
    );

  if (!confirmed) {
    return;
  }

  setCardBusy(
    pinId,
    true
  );

  setCardStatus(
    pinId,
    decision === "approve"
      ? "Applying verified experience recognition..."
      : "Recording rejection..."
  );

  try {
    const response =
      await finalizeExperience({
        pinId,
        decision,
        managementNote:
          note || null
      });

    if (
      response.data?.ok !== true
    ) {
      throw new Error(
        "Experience validation was not completed."
      );
    }

    if (
      decision === "approve"
    ) {
      const awarded =
        Number(
          response.data
            ?.awardedAmount ??
          response.data
            ?.delta ??
          0
        );

      const held =
        Number(
          response.data
            ?.recognitionHeld ??
          0
        );

      setCardStatus(
        pinId,
        `Approved · ${awarded} XP issued now` +
        (
          held > 0
            ? ` · ${held} XP held for Tier 1 entry`
            : ""
        )
      );
    } else {
      setCardStatus(
        pinId,
        "Prior-experience recognition rejected."
      );
    }

    window.setTimeout(
      loadPins,
      650
    );

  } catch (error) {
    console.error(
      "Experience validation failed:",
      error
    );

    setCardStatus(
      pinId,
      error?.message ||
      "Experience validation failed."
    );

    setCardBusy(
      pinId,
      false
    );
  }
}

document.addEventListener(
  "click",
  (event) => {
    const approve =
      event.target.closest(
        "[data-approve-pin]"
      );

    if (approve) {
      void finalizePin(
        clean(
          approve.dataset
            .approvePin
        ),
        "approve"
      );

      return;
    }

    const reject =
      event.target.closest(
        "[data-reject-pin]"
      );

    if (reject) {
      void finalizePin(
        clean(
          reject.dataset
            .rejectPin
        ),
        "reject"
      );
    }
  }
);

$("refreshBtn")
  ?.addEventListener(
    "click",
    () => {
      void loadPins();
    }
  );

void loadPins();
