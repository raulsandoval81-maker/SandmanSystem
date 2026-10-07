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

const saveValidationObservation =
  httpsCallable(
    functions,
    "saveAthleteValidationObservation"
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

function programDisplayLabel(value) {
  const normalized =
    clean(value).toLowerCase();

  if (
    normalized === "zero2hero" ||
    normalized === "zero-to-hero" ||
    normalized === "road2champion"
  ) {
    return "Road2Champion";
  }

  if (
    normalized === "path2legend"
  ) {
    return "Path2Legend";
  }

  if (
    normalized === "quest2mastery"
  ) {
    return "Quest2Mastery";
  }

  return clean(value) || "—";
}

function placementExample(athleteUid) {
  return clean(athleteUid)
    .toUpperCase()
    .startsWith("F8_")
      ? "Example: Shadow · T0"
      : "Example: Apprentice · T0";
}

function disciplineDisplayLabel(value) {
  const normalized =
    clean(value).toLowerCase();

  return ({
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
    "muay thai": "Muay Thai",
    mma: "MMA",
    grappling: "Grappling"
  })[normalized] || clean(value) || "—";
}

function locationDisplayLabel(value) {
  const normalized =
    clean(value)
      .replaceAll("-", " ");

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part.charAt(0).toUpperCase() +
      part.slice(1)
    )
    .join(" ") || "—";
}


function xpForExperience(value) {
  const years = Number(value || 0);

  if (years === 1) return 200;
  if (years === 2) return 400;
  if (years >= 3) return 600;

  return 0;
}

function claimedRangeLabel(value) {
  return ({
    "under-1": "Less than 1 year",
    "1-2": "1–2 years",
    "2-3": "2–3 years",
    "3-plus": "3+ years"
  })[clean(value).toLowerCase()] || "Not provided";
}

function yesNoLabel(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  return "Not provided";
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

function pacificDayKey() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(
      new Date()
    );

  const values =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value
      ])
    );

  return `${values.year}-${values.month}-${values.day}`;
}

function fearScoreField(
  pinId,
  key,
  label
) {
  return `
    <label class="assessment-field">
      <span>${esc(label)} · 1–5</span>

      <select
        data-validation-fear="${esc(key)}"
        data-pin="${esc(pinId)}"
      >
        <option value="">
          Score…
        </option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
      </select>
    </label>
  `;
}

function sortedValidationObservations(pin) {
  const source =
    pin?.validationObservations &&
    typeof pin.validationObservations === "object"
      ? pin.validationObservations
      : {};

  return Object.values(source)
    .filter(
      (item) =>
        item &&
        typeof item === "object"
    )
    .sort(
      (a, b) =>
        clean(a.dayKey)
          .localeCompare(
            clean(b.dayKey)
          )
    )
    .slice(0, 2);
}

function renderValidationHistory(pin) {
  const observations =
    sortedValidationObservations(pin);

  if (!observations.length) {
    return `
      <div class="assessment-validation-empty">
        No validation practice observation saved yet.
      </div>
    `;
  }

  return observations
    .map((observation, index) => {
      const total =
        Number(
          observation?.fear?.total ||
          0
        );

      const shirt =
        observation?.shirt === "academy"
          ? "Academy Shirt"
          : observation?.shirt === "plain_white"
            ? "Plain White"
            : "Other";

      const result =
        observation?.fullCreditEligible === true
          ? "Full-credit standard met"
          : "5 XP cap";

      return `
        <div class="assessment-validation-history-item">
          <div>
            <strong>
              Day ${index + 1} · ${esc(
                observation?.dayKey || "—"
              )}
            </strong>
            <span>
              FEAR ${esc(total)}/20 ·
              ${esc(shirt)} ·
              ${esc(
                clean(
                  observation?.execution
                ) || "—"
              )}
            </span>
          </div>
          <b class="${
            observation?.fullCreditEligible === true
              ? "is-pass"
              : "is-half"
          }">
            ${esc(result)}
          </b>
        </div>
      `;
    })
    .join("");
}

function latestValidationObservation(pin) {
  const observations =
    sortedValidationObservations(pin);

  return observations.length
    ? observations[
        observations.length - 1
      ]
    : null;
}

function categoricalFearValue(score) {
  const value = Number(score || 0);

  if (value >= 4) return "meets";
  if (value === 3) return "developing";
  if (value >= 1) return "concern";
  return "";
}

function renderValidationObservationSection(
  pin,
  pinId
) {
  const observation =
    latestValidationObservation(pin);

  const focus =
    categoricalFearValue(
      observation?.fear?.focus
    );
  const effort =
    categoricalFearValue(
      observation?.fear?.effort
    );
  const attitude =
    categoricalFearValue(
      observation?.fear?.attitude
    );
  const respect =
    categoricalFearValue(
      observation?.fear?.respect
    );

  return `
    <section class="assessment-validation">
      <details class="assessment-validation-details">
        <summary class="assessment-validation-summary">
          <span>
            <small>Prior-Experience Validation</small>
            <strong>Practice Observation · FEAR + Skills</strong>
          </span>
          <span class="assessment-validation-chevron" aria-hidden="true">⌄</span>
        </summary>

        <div class="assessment-validation-body">
      <p class="assessment-confirm-note">
        Save one observation when time allows; a second observation on a separate practice day is preferred. The first two validation practices are capped at 5 XP unless that day's guardrails are met.
      </p>

      <label class="assessment-field assessment-validation-date">
        <span>Practice Date</span>
        <input
          type="date"
          data-validation-day
          data-pin="${esc(pinId)}"
          value="${esc(pacificDayKey())}"
        >
      </label>

      <div class="assessment-grid assessment-grid--four">
        ${fearScoreField(
          pinId,
          "focus",
          "Focus"
        )}
        ${fearScoreField(
          pinId,
          "effort",
          "Effort"
        )}
        ${fearScoreField(
          pinId,
          "attitude",
          "Attitude"
        )}
        ${fearScoreField(
          pinId,
          "respect",
          "Respect"
        )}
      </div>

      <div class="assessment-grid assessment-grid--two assessment-validation-standards">
        <label class="assessment-field">
          <span>Shirt Standard</span>
          <select
            data-validation-shirt
            data-pin="${esc(pinId)}"
          >
            <option value="">Select…</option>
            <option value="plain_white">Plain White Shirt</option>
            <option value="academy">Academy Shirt</option>
            <option value="other">Other / Not Yet Up To Standard</option>
          </select>
        </label>

        <label class="assessment-field">
          <span>Execution Quality</span>
          <select
            data-validation-execution
            data-pin="${esc(pinId)}"
          >
            <option value="">Select…</option>
            <option value="clean">Clean</option>
            <option value="smooth">Smooth</option>
            <option value="rigid">Rigid</option>
            <option value="sloppy">Sloppy</option>
          </select>
        </label>
      </div>

      <div class="assessment-validation-checks">
        <label>
          <input
            type="checkbox"
            data-validation-correct-skills
            data-pin="${esc(pinId)}"
          >
          <span>Correct skills</span>
        </label>

        <label>
          <input
            type="checkbox"
            data-validation-know-how
            data-pin="${esc(pinId)}"
          >
          <span>Shows know-how</span>
        </label>
      </div>

      <div class="assessment-validation-actions">
        <p
          class="assessment-card-status"
          data-validation-status="${esc(pinId)}"
          role="status"
          aria-live="polite"
        ></p>

        <button
          type="button"
          class="assessment-button assessment-button--outline"
          data-save-validation="${esc(pinId)}"
        >
          Save Practice Observation
        </button>
      </div>

      <div
        class="assessment-validation-history"
        data-validation-history="${esc(pinId)}"
      >
        ${renderValidationHistory(pin)}
      </div>

      <select
        data-fear="focus"
        data-pin="${esc(pinId)}"
        hidden
      >
        <option value="${esc(focus)}" selected>${esc(focus)}</option>
      </select>

      <select
        data-fear="effort"
        data-pin="${esc(pinId)}"
        hidden
      >
        <option value="${esc(effort)}" selected>${esc(effort)}</option>
      </select>

      <select
        data-fear="attitude"
        data-pin="${esc(pinId)}"
        hidden
      >
        <option value="${esc(attitude)}" selected>${esc(attitude)}</option>
      </select>

      <select
        data-fear="respect"
        data-pin="${esc(pinId)}"
        hidden
      >
        <option value="${esc(respect)}" selected>${esc(respect)}</option>
      </select>
        </div>
      </details>
    </section>
  `;
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
    locationDisplayLabel(
      pin.locationId
    );

  const discipline =
    disciplineDisplayLabel(
      pin.discipline
    );

  const program =
    programDisplayLabel(
      pin.program
    );

  const currentXp =
    Math.max(
      0,
      Number(
        pin.currentEarnedXp || 0
      )
    );

  const claim =
    pin.claimedExperience &&
    typeof pin.claimedExperience === "object"
      ? pin.claimedExperience
      : {};

  const claimedPrior =
    yesNoLabel(claim.priorExperience);

  const isValidationClaim =
    clean(
      claim.priorExperience
    ).toLowerCase() === "yes";

  const claimedRange =
    claimedRangeLabel(claim.range);

  const claimedNotes =
    clean(claim.notes) || "No additional details provided.";

  const claimedDiscipline =
    disciplineDisplayLabel(
      claim.discipline ||
      pin.discipline
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

      ${
        isValidationClaim
          ? renderValidationObservationSection(
              pin,
              pinId
            )
          : `
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
            `
      }

      <div class="assessment-divider"></div>

      <section>
        <p class="assessment-eyebrow">
          Prior Experience
        </p>

        <h4>
          Claimed by Family / Athlete
        </h4>

        <div class="assessment-claim-box">
          <div>
            <span>Prior Experience Claimed</span>
            <strong>${esc(claimedPrior)}</strong>
          </div>

          <div>
            <span>Claimed Time</span>
            <strong>${esc(claimedRange)}</strong>
          </div>

          <div>
            <span>Discipline</span>
            <strong>${esc(claimedDiscipline)}</strong>
          </div>

          <div class="assessment-claim-notes">
            <span>Submitted Details</span>
            <p>${esc(claimedNotes)}</p>
          </div>
        </div>

        <h4>
          Coach Confirmation
        </h4>

        <p class="assessment-confirm-note">
          Confirm what you observe. The submitted claim is context only and does not create starting XP by itself.
        </p>

        <div class="assessment-grid assessment-grid--two">

          <label class="assessment-field">
            <span>
              Verified Experience
            </span>

            <select
              data-experience-mode
              data-pin="${esc(pinId)}"
            >
              <option value="">
                Confirm experience…
              </option>

              <option value="0">
                No Verified Prior Experience
              </option>

              <option value="lt1">
                Less than 1 Year
              </option>

              <option value="1">
                1 Year — 200 XP Total
              </option>

              <option value="2">
                2 Years — 400 XP Total
              </option>

              <option value="3">
                3+ Years — 600 XP Total
              </option>
            </select>
          </label>

          <div class="assessment-recognition">
            <span>
              Recognition Plan Total
            </span>

            <strong
              data-recognition-xp="${esc(pinId)}"
            >
              0 XP
            </strong>

            <small>
              Separate from earned practice XP. Management applies the issued-now / held schedule.
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
              Coach Recognition Recommendation
            </span>

            <input
              data-manual-xp
              data-pin="${esc(pinId)}"
              type="number"
              min="0"
              max="199"
              step="1"
              inputmode="numeric"
              placeholder="0–199 XP"
            >

            <small class="assessment-field-help">
              Less than 1 year: Coach may recommend 0–199 XP. Management authorizes the final recognition.
            </small>
          </label>

          <label class="assessment-field">
            <span>
              Required Coach Note
            </span>

            <textarea
              data-experience-note
              data-pin="${esc(pinId)}"
              rows="3"
              placeholder="Explain the prior-experience recognition recommendation."
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
              placeholder="${esc(
                placementExample(
                  athleteUid
                )
              )}"
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

function wireValidationObservationControls() {
  document
    .querySelectorAll(
      "[data-save-validation]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const pinId =
            clean(
              button.dataset
                .saveValidation
            );

          const statusEl =
            document.querySelector(
              `[data-validation-status="${CSS.escape(
                pinId
              )}"]`
            );

          const dayKey =
            valueFor(
              "[data-validation-day]",
              pinId
            );

          const scoreFor =
            (key) =>
              Number(
                valueFor(
                  `[data-validation-fear="${key}"]`,
                  pinId
                )
              );

          const focus =
            scoreFor("focus");
          const effort =
            scoreFor("effort");
          const attitude =
            scoreFor("attitude");
          const respect =
            scoreFor("respect");

          const shirt =
            valueFor(
              "[data-validation-shirt]",
              pinId
            );

          const execution =
            valueFor(
              "[data-validation-execution]",
              pinId
            );

          const correctSkills =
            document.querySelector(
              `[data-validation-correct-skills][data-pin="${CSS.escape(
                pinId
              )}"]`
            )?.checked === true;

          const knowHow =
            document.querySelector(
              `[data-validation-know-how][data-pin="${CSS.escape(
                pinId
              )}"]`
            )?.checked === true;

          if (
            !dayKey ||
            !focus ||
            !effort ||
            !attitude ||
            !respect ||
            !shirt ||
            !execution
          ) {
            if (statusEl) {
              statusEl.textContent =
                "Complete the validation observation before saving.";
            }
            return;
          }

          button.disabled = true;

          if (statusEl) {
            statusEl.textContent =
              "Saving observation…";
          }

          try {
            const response =
              await saveValidationObservation({
                pinId,
                dayKey,
                fear: {
                  focus,
                  effort,
                  attitude,
                  respect
                },
                shirt,
                execution,
                correctSkills,
                knowHow
              });

            const total =
              Number(
                response?.data?.fearTotal ||
                0
              );

            const full =
              response?.data
                ?.fullCreditEligible === true;

            if (statusEl) {
              statusEl.textContent =
                full
                  ? `Saved · FEAR ${total}/20 · full-credit standard met.`
                  : `Saved · FEAR ${total}/20 · 5 XP validation cap applies.`;
            }

            await loadAssessments();
          } catch (error) {
            console.error(
              "Validation observation save failed:",
              error
            );

            if (statusEl) {
              statusEl.textContent =
                error?.message ||
                "Unable to save validation observation.";
            }

            button.disabled = false;
          }
        }
      );
    });
}

function wireExperienceControls() {
  function syncManualRecognition(pinId) {
    const manualInput =
      document.querySelector(
        `[data-manual-xp][data-pin="${CSS.escape(
          pinId
        )}"]`
      );

    const recognition =
      document.querySelector(
        `[data-recognition-xp="${CSS.escape(
          pinId
        )}"]`
      );

    if (!recognition) return;

    const raw =
      clean(
        manualInput?.value
      );

    if (!raw) {
      recognition.textContent =
        "0 XP";
      return;
    }

    const amount =
      Math.max(
        0,
        Math.min(
          199,
          Math.floor(
            Number(raw)
          )
        )
      );

    recognition.textContent =
      `${amount} XP`;
  }

  document
    .querySelectorAll(
      "[data-experience-mode]"
    )
    .forEach((select) => {
      const pinId =
        clean(select.dataset.pin);

      const sync =
        () => {
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

          const isLessThanOne =
            value === "lt1";

          if (manualArea) {
            manualArea.hidden =
              !isLessThanOne;
          }

          if (!recognition) return;

          if (isLessThanOne) {
            syncManualRecognition(
              pinId
            );
          } else {
            recognition.textContent =
              `${xpForExperience(
                value
              )} XP`;
          }
        };

      select.addEventListener(
        "change",
        sync
      );

      sync();
    });

  document
    .querySelectorAll(
      "[data-manual-xp]"
    )
    .forEach((input) => {
      input.addEventListener(
        "input",
        () => {
          syncManualRecognition(
            clean(
              input.dataset.pin
            )
          );
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
        "Complete FEAR before returning the assessment. Prior-experience validation athletes need at least one saved practice observation."
      );
    }

    const experienceSelection =
      valueFor(
        "[data-experience-mode]",
        pinId
      );

    if (!experienceSelection) {
      throw new Error(
        "Confirm the athlete's prior experience."
      );
    }

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
      "lt1"
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

      if (manualXpRaw === "") {
        throw new Error(
          "Enter the Coach prior-experience XP recommendation."
        );
      }

      const recognitionXp =
        Number(
          manualXpRaw
        );

      if (
        !Number.isInteger(
          recognitionXp
        ) ||
        recognitionXp < 0 ||
        recognitionXp >= 200
      ) {
        throw new Error(
          "Recognition XP must be a whole number from 0 to 199."
        );
      }

      if (!experienceNote) {
        throw new Error(
          "Less-than-1-year recognition requires a Coach note."
        );
      }

      payload.experienceMode =
        "manual";

      payload.manualExperienceXp =
        recognitionXp;

      payload.experienceNote =
        experienceNote;
    } else {
      payload.experienceMode =
        "standard";

      payload.verifiedExperienceYears =
        Number(
          experienceSelection
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

    wireValidationObservationControls();
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
