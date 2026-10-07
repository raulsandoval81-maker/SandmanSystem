import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const $ = (id) =>
  document.getElementById(id);

const searchMembers =
  httpsCallable(
    functions,
    "searchManagementMembers"
  );

const createAdjustment =
  httpsCallable(
    functions,
    "createManagementXpAdjustment"
  );

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

const recordPlacement =
  httpsCallable(
    functions,
    "recordAthleteAssessmentPlacement"
  );

const searchForm =
  $("athleteSearchForm");

const searchInput =
  $("athleteSearch");

const searchButton =
  $("searchButton");

const searchStatus =
  $("searchStatus");

const searchResults =
  $("searchResults");

const selectedAthlete =
  $("selectedAthlete");

const adjustmentPanel =
  $("adjustmentPanel");

const adjustmentForm =
  $("adjustmentForm");

const categoryInput =
  $("adjustmentCategory");

const amountInput =
  $("adjustmentAmount");

const amountField =
  $("adjustmentAmountField");

const verifiedExperienceField =
  $("verifiedExperienceField");

const verifiedExperienceYears =
  $("verifiedExperienceYears");

const managementRecognitionField =
  $("managementRecognitionField");

const managementRecognitionXp =
  $("managementRecognitionXp");

const managementRecognitionHint =
  $("managementRecognitionHint");

const managementRecognitionCap =
  $("managementRecognitionCap");

const managementRecognitionBreakdown =
  $("managementRecognitionBreakdown");

const reasonInput =
  $("adjustmentReason");

const adjustmentStatus =
  $("adjustmentStatus");

const applyButton =
  $("applyAdjustmentButton");

const clearButton =
  $("clearAdjustmentButton");

const experienceValidationStatus =
  $("experienceValidationStatus");

const experienceValidationContent =
  $("experienceValidationContent");

const experienceModeButton =
  $("experienceModeButton");

const adjustmentModeButton =
  $("adjustmentModeButton");

const xpAdjustmentPanel =
  $("xpAdjustmentPanel");

let athlete = null;
let selectedDiscipline = "";
let activeXpMode = "experience";

function setXpMode(mode) {
  activeXpMode =
    mode === "adjustment"
      ? "adjustment"
      : "experience";

  const experienceActive =
    activeXpMode === "experience";

  experienceModeButton?.classList.toggle(
    "is-active",
    experienceActive
  );

  adjustmentModeButton?.classList.toggle(
    "is-active",
    !experienceActive
  );

  experienceModeButton?.setAttribute(
    "aria-selected",
    String(experienceActive)
  );

  adjustmentModeButton?.setAttribute(
    "aria-selected",
    String(!experienceActive)
  );

  const experienceChevron =
    experienceModeButton?.querySelector(
      ".xp-mode-chevron"
    );

  const adjustmentChevron =
    adjustmentModeButton?.querySelector(
      ".xp-mode-chevron"
    );

  if (experienceChevron) {
    experienceChevron.textContent =
      experienceActive ? "›" : "";
  }

  if (adjustmentChevron) {
    adjustmentChevron.textContent =
      experienceActive ? "" : "‹";
  }

  if (adjustmentPanel && !adjustmentPanel.hidden) {
    const experiencePanel =
      $("experienceValidationPanel");

    if (experiencePanel) {
      experiencePanel.hidden =
        !experienceActive;
    }

    if (xpAdjustmentPanel) {
      xpAdjustmentPanel.hidden =
        experienceActive;
    }
  }
}

experienceModeButton?.addEventListener(
  "click",
  () => setXpMode("experience")
);

adjustmentModeButton?.addEventListener(
  "click",
  () => {
    setXpMode("adjustment");

    if (
      athlete &&
      selectedDiscipline
    ) {
      categoryInput?.focus();
    }
  }
);

setXpMode("experience");

function clean(value) {
  return String(value ?? "").trim();
}

function esc(value) {
  return String(value ?? "")
    .replace(
      /[&<>'"]/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[char]
    );
}

function setSearchStatus(
  message,
  error = false
) {
  searchStatus.textContent =
    message || "";

  searchStatus.classList.toggle(
    "is-error",
    error
  );
}

function setAdjustmentStatus(
  message,
  error = false
) {
  adjustmentStatus.textContent =
    message || "";

  adjustmentStatus.classList.toggle(
    "is-error",
    error
  );
}

function summaryItem(
  label,
  value
) {
  return `
    <div class="summary-item">
      <span>${esc(label)}</span>
      <strong>${esc(value || "—")}</strong>
    </div>
  `;
}

function disciplineLabel(value) {
  return ({
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
    mma: "MMA",
    "submission-grappling": "Submission Grappling"
  })[value] ||
    clean(value)
      .split("-")
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1)
      )
      .join(" ");
}

function disciplineProgressions(member) {
  const rows =
    Array.isArray(
      member.disciplineProgress
    )
      ? member.disciplineProgress
      : [];

  if (rows.length) {
    return rows;
  }

  const fallback =
    clean(
      member.primaryDiscipline
    ).toLowerCase();

  if (!fallback) {
    return [];
  }

  return [{
    discipline:
      fallback,

    trackBase:
      member.trackBase ||
      member.pathway ||
      "",

    tier:
      member.tier ||
      "",

    rankName:
      member.rankName ||
      "",

    xp:
      Number(
        member.xp || 0
      ),

    xpCap:
      Number(
        member.xpCap || 0
      )
  }];
}

function progressionFor(
  member,
  discipline
) {
  return disciplineProgressions(
    member
  ).find(
    (row) =>
      clean(
        row.discipline
      ).toLowerCase() ===
      clean(
        discipline
      ).toLowerCase()
  ) || null;
}

function renderProgressionSummary() {
  const summary =
    $("disciplineProgressSummary");

  if (!summary) {
    return;
  }

  const progression =
    progressionFor(
      athlete,
      selectedDiscipline
    );

  if (!progression) {
    summary.innerHTML = "";
    return;
  }

  summary.innerHTML = `
    ${summaryItem(
      "Discipline",
      disciplineLabel(
        selectedDiscipline
      )
    )}

    ${summaryItem(
      "Track",
      progression.trackBase ||
      athlete?.pathway
    )}

    ${summaryItem(
      "Rank",
      [
        progression.tier,
        progression.rankName
      ].filter(Boolean).join(" ")
    )}

    ${summaryItem(
      "Current XP",
      `${Number(
        progression.xp || 0
      )} XP`
    )}
  `;
}


function experiencePlan(priorExperience = {}) {
  if (priorExperience.manual === true) {
    const total = Math.max(0, Number(priorExperience.manualXp ?? priorExperience.recognitionXp ?? 0));
    return { label: "Less than 1 Year", now: total, held: 0 };
  }

  const years = Number(priorExperience.verifiedYears || 0);

  if (years === 1) return { label: "1 Year Verified", now: 200, held: 0 };
  if (years === 2) return { label: "2 Years Verified", now: 200, held: 200 };
  if (years >= 3) return { label: "3+ Years Verified", now: 300, held: 300 };

  return { label: "No Prior Experience", now: 0, held: 0 };
}

function fearSummary(fear = {}) {
  return [
    ["Focus", fear.focus],
    ["Effort", fear.effort],
    ["Attitude", fear.attitude],
    ["Respect", fear.respect]
  ].map(([label, value]) => `${label}: ${clean(value) || "—"}`).join(" · ");
}

function setExperienceStatus(message) {
  if (experienceValidationStatus) experienceValidationStatus.textContent = message || "";
}

function renderExperienceValidation(pin) {
  if (!experienceValidationContent) return;

  if (!pin) {
    experienceValidationContent.innerHTML = `
      <p class="xp-static-state">
        No returned Coach assessment is waiting for Management validation for this athlete.
      </p>
    `;
    setExperienceStatus("No returned assessment pending.");
    return;
  }

  const plan = experiencePlan(pin.priorExperience || {});
  const recognitionStatus = clean(pin.experienceRecognitionStatus).toUpperCase();
  const resolved = recognitionStatus === "AWARDED" || recognitionStatus === "REJECTED";
  const coachNotes = clean(pin.coachNotes) || "No additional Coach notes.";
  const placement = clean(pin.placementRecommendation) || "—";

  setExperienceStatus(
    resolved
      ? `Recognition ${recognitionStatus === "AWARDED" ? "approved" : "rejected"} · final placement pending`
      : "Returned by Coach · Management decision required"
  );

  experienceValidationContent.innerHTML = `
    <div class="summary-grid">
      ${summaryItem("Coach Validation", plan.label)}
      ${summaryItem("XP Now", `${plan.now} XP`)}
      ${summaryItem("Held XP", plan.held ? `${plan.held} XP` : "0 XP")}
      ${summaryItem("Placement Recommendation", placement)}
    </div>

    <details class="xp-assessment-details">
      <summary>View Coach Assessment</summary>
      <div>
        <p><strong>FEAR:</strong> ${esc(fearSummary(pin.fear || {}))}</p>
        <p><strong>Coach Notes:</strong> ${esc(coachNotes)}</p>
      </div>
    </details>

    <label class="field">
      <span>Management Note</span>
      <textarea id="experienceManagementNote" rows="4" maxlength="1000"
        placeholder="Optional Management note."></textarea>
    </label>

    <p id="experienceActionStatus" class="status-line" role="status" aria-live="polite"></p>

    <div class="action-row">
      ${
        resolved
          ? `<button id="recordPlacementButton" class="button button-primary" type="button">Record Final Placement</button>`
          : `
              <button id="rejectExperienceButton" class="button button-secondary" type="button">Reject Recognition</button>
              <button id="approveExperienceButton" class="button button-primary" type="button">Approve Recognition</button>
            `
      }
    </div>
  `;

  const actionStatus = $("experienceActionStatus");
  const setActionStatus = (message, error = false) => {
    if (!actionStatus) return;
    actionStatus.textContent = message || "";
    actionStatus.classList.toggle("is-error", error);
  };

  const setBusy = (busy) => {
    experienceValidationContent.querySelectorAll("button").forEach((button) => {
      button.disabled = busy;
    });
  };

  $("approveExperienceButton")?.addEventListener("click", async () => {
    if (!window.confirm("Approve this prior-experience recognition?")) return;
    setBusy(true);
    setActionStatus("Applying verified experience recognition…");
    try {
      const response = await finalizeExperience({
        pinId: clean(pin.id),
        decision: "approve",
        managementNote: clean($("experienceManagementNote")?.value) || null
      });
      if (response.data?.ok !== true) throw new Error("Experience validation was not completed.");
      const awarded = Number(response.data?.awardedAmount ?? response.data?.delta ?? 0);
      const held = Number(response.data?.recognitionHeld ?? 0);
      setActionStatus(`Approved · ${awarded} XP issued now${held > 0 ? ` · ${held} XP held` : ""}`);
      await loadSelectedExperience();
    } catch (error) {
      setActionStatus(error?.message || "Experience validation failed.", true);
      setBusy(false);
    }
  });

  $("rejectExperienceButton")?.addEventListener("click", async () => {
    if (!window.confirm("Reject this prior-experience recognition?")) return;
    setBusy(true);
    setActionStatus("Recording rejection…");
    try {
      const response = await finalizeExperience({
        pinId: clean(pin.id),
        decision: "reject",
        managementNote: clean($("experienceManagementNote")?.value) || null
      });
      if (response.data?.ok !== true) throw new Error("Experience validation was not completed.");
      setActionStatus("Prior-experience recognition rejected.");
      await loadSelectedExperience();
    } catch (error) {
      setActionStatus(error?.message || "Experience validation failed.", true);
      setBusy(false);
    }
  });

  $("recordPlacementButton")?.addEventListener("click", async () => {
    if (!window.confirm("Record Management final placement for this returned Coach assessment?")) return;
    setBusy(true);
    setActionStatus("Recording final placement…");
    try {
      const response = await recordPlacement({
        pinId: clean(pin.id),
        finalPlacementNote: clean($("experienceManagementNote")?.value) || null
      });
      if (response.data?.ok !== true || response.data?.status !== "PLACEMENT_RECORDED") {
        throw new Error("Final placement was not recorded.");
      }
      setActionStatus("✓ Final placement recorded.");
      await loadSelectedExperience();
    } catch (error) {
      setActionStatus(error?.message || "Final placement failed.", true);
      setBusy(false);
    }
  });
}

async function loadSelectedExperience() {
  if (!athlete?.athleteId) {
    renderExperienceValidation(null);
    return;
  }

  setExperienceStatus("Checking for returned Coach assessment…");
  if (experienceValidationContent) experienceValidationContent.innerHTML = "";

  try {
    const response = await listPins({});
    const pins = Array.isArray(response.data?.pins) ? response.data.pins : [];

    const pin = pins.find((item) => {
      const sameAthlete =
        clean(item.athleteUid).toLowerCase() === clean(athlete.athleteId).toLowerCase();

      const sameDiscipline =
        !selectedDiscipline ||
        clean(item.discipline).toLowerCase() === clean(selectedDiscipline).toLowerCase();

      const status = clean(item.status).toUpperCase();

      return sameAthlete &&
        sameDiscipline &&
        (status === "RETURNED_TO_MANAGEMENT" || status === "PLACEMENT_RECORDED");
    }) || null;

    renderExperienceValidation(pin);
  } catch (error) {
    console.error("[management-xp] experience lookup failed", error);
    setExperienceStatus("Unable to check Coach assessment.");
    if (experienceValidationContent) {
      experienceValidationContent.innerHTML = `
        <p class="xp-static-state is-error">Unable to load returned Coach assessment.</p>
      `;
    }
  }
}

function renderAthlete(member) {
  athlete = member;
  selectedDiscipline = "";

  const progressions =
    disciplineProgressions(
      member
    );

  if (progressions.length === 1) {
    selectedDiscipline =
      clean(
        progressions[0]
          .discipline
      ).toLowerCase();
  }

  selectedAthlete.hidden = false;
  adjustmentPanel.hidden =
    !selectedDiscipline;

  selectedAthlete.innerHTML = `
    <p class="adjustment-eyebrow">
      Step 2
    </p>

    <div class="selected-athlete-head">
      <div>
        <h3>
          ${esc(member.name)}
        </h3>

        <div class="athlete-id">
          ${esc(member.athleteId)}
        </div>
      </div>

      <button
        id="changeAthleteButton"
        class="button button-secondary"
        type="button"
      >
        Change Athlete
      </button>
    </div>

    <div class="summary-grid">
      ${summaryItem(
        "Athlete ID / UID",
        member.athleteId
      )}
    </div>

    ${
      progressions.length > 1
        ? `
          <label class="field discipline-field">
            <span>
              Discipline
            </span>

            <select
              id="disciplineSelect"
              required
            >
              <option value="">
                Select discipline…
              </option>

              ${progressions.map(
                (row) => `
                  <option
                    value="${esc(
                      clean(
                        row.discipline
                      ).toLowerCase()
                    )}"
                  >
                    ${esc(
                      disciplineLabel(
                        row.discipline
                      )
                    )}
                  </option>
                `
              ).join("")}
            </select>
          </label>
        `
        : ""
    }

    <div
      id="disciplineProgressSummary"
      class="summary-grid"
    ></div>
  `;

  $("changeAthleteButton")
    ?.addEventListener(
      "click",
      clearAll
    );

  const disciplineSelect =
    $("disciplineSelect");

  disciplineSelect
    ?.addEventListener(
      "change",
      () => {
        selectedDiscipline =
          clean(
            disciplineSelect.value
          ).toLowerCase();

        adjustmentPanel.hidden =
          !selectedDiscipline;

        renderProgressionSummary();
        void loadSelectedExperience();
        setXpMode(activeXpMode);

        if (selectedDiscipline) {
          setSearchStatus(
            `${disciplineLabel(
              selectedDiscipline
            )} progression selected.`
          );

          if (activeXpMode === "adjustment") {
            categoryInput.focus();
          }
        }
      }
    );

  renderProgressionSummary();
  void loadSelectedExperience();
  syncOverrideAvailability();
  syncAdjustmentCategoryUi();
  setXpMode(activeXpMode);

  if (!progressions.length) {
    setSearchStatus(
      "No verified discipline progression was found for this athlete.",
      true
    );
  } else if (
    progressions.length > 1
  ) {
    setSearchStatus(
      "Existing athlete selected. Choose the discipline to adjust."
    );
  } else {
    setSearchStatus(
      `${disciplineLabel(
        selectedDiscipline
      )} progression selected.`
    );

    if (activeXpMode === "adjustment") {
      categoryInput.focus();
    }
  }

  searchResults.innerHTML = "";
}

function clearAdjustmentFields() {
  categoryInput.value = "";
  amountInput.value = "";
  if (verifiedExperienceYears) {
    verifiedExperienceYears.value = "";
  }
  if (managementRecognitionXp) {
    managementRecognitionXp.value = "";
  }
  reasonInput.value = "";

  syncAdjustmentCategoryUi();
  setAdjustmentStatus("");
}

function clearAll() {
  athlete = null;
  selectedDiscipline = "";

  selectedAthlete.hidden = true;
  adjustmentPanel.hidden = true;

  selectedAthlete.innerHTML = "";
  searchResults.innerHTML = "";
  if (experienceValidationContent) experienceValidationContent.innerHTML = "";
  setExperienceStatus("");

  clearAdjustmentFields();

  searchInput.value = "";

  setSearchStatus("");

  searchInput.focus();
}

function categoryLabel(value) {
  return ({
    delayed_onboarding:
      "Delayed Onboarding",

    downtime_recovery:
      "Downtime Recovery",

    paper_reconciliation:
      "Paper Reconciliation",

    verified_experience_override:
      "Verified Experience Override — One Time",

    correction:
      "Correction"
  })[value] || value;
}

function overrideOption() {
  return categoryInput?.querySelector(
    'option[value="verified_experience_override"]'
  ) || null;
}

function syncOverrideAvailability() {
  const option =
    overrideOption();

  if (!option) return;

  const used =
    athlete?.priorExperienceRecognitionUsed ===
    true;

  option.hidden = used;
  option.disabled = used;

  if (
    used &&
    categoryInput.value ===
      "verified_experience_override"
  ) {
    categoryInput.value = "";
  }
}

function recognitionStageCap(yearsValue) {
  const years = Number(yearsValue || 0);

  if (years === 1) return 200;
  if (years === 2) return 200;
  if (years === 3) return 300;

  return 0;
}

function selectedRecognitionPlan() {
  const years =
    Number(
      verifiedExperienceYears?.value ||
      0
    );

  const perStage =
    Number(
      managementRecognitionXp?.value ||
      0
    );

  const stageCap =
    recognitionStageCap(years);

  if (
    !stageCap ||
    !Number.isInteger(perStage) ||
    perStage <= 0 ||
    perStage > stageCap
  ) {
    return null;
  }

  if (years === 1) {
    return {
      perStage,
      total: perStage,
      now: perStage,
      held: 0
    };
  }

  return {
    perStage,
    total: perStage * 2,
    now: perStage,
    held: perStage
  };
}

function renderRecognitionBreakdown() {
  if (!managementRecognitionBreakdown) return;

  const years =
    Number(
      verifiedExperienceYears?.value ||
      0
    );

  const plan =
    selectedRecognitionPlan();

  if (!years || !plan) {
    managementRecognitionBreakdown.hidden = true;
    managementRecognitionBreakdown.innerHTML = "";
    return;
  }

  const yearLabel =
    years === 3
      ? "3+ Years"
      : `${years} Year${years === 1 ? "" : "s"}`;

  managementRecognitionBreakdown.hidden = false;
  managementRecognitionBreakdown.innerHTML = `
    <strong>${yearLabel} Recognition</strong>
    <p>
      <b>${plan.now} XP now</b>
      ·
      ${plan.held
        ? `<b>${plan.held} XP at Tier 1</b>`
        : "<b>No later XP</b>"}
      ·
      ${plan.total} XP total
    </p>
  `;
}

function syncRecognitionInput() {
  if (
    !managementRecognitionXp ||
    !managementRecognitionHint
  ) {
    return;
  }

  const years =
    Number(
      verifiedExperienceYears?.value ||
      0
    );

  const stageCap =
    recognitionStageCap(years);

  managementRecognitionXp.value = "";

  if (!stageCap) {
    managementRecognitionXp.max = "";
    managementRecognitionXp.placeholder =
      "Select verified year first";

    if (managementRecognitionCap) {
      managementRecognitionCap.hidden = true;
      managementRecognitionCap.textContent = "";
    }

    managementRecognitionHint.textContent =
      "System stage cap will appear after the verified year is selected.";

    renderRecognitionBreakdown();
    return;
  }

  if (managementRecognitionCap) {
    managementRecognitionCap.hidden = false;
    managementRecognitionCap.textContent =
      `MAX ${stageCap} XP / STAGE`;
  }

  managementRecognitionXp.max =
    String(stageCap);

  managementRecognitionXp.placeholder =
    `1–${stageCap} XP per stage`;

  managementRecognitionHint.textContent =
    years === 1
      ? `1 Year: up to ${stageCap} XP now. No held XP.`
      : `${years === 3 ? "3+ Years" : "2 Years"}: up to ${stageCap} XP now and the same amount held for Tier 1.`;

  renderRecognitionBreakdown();
}

function syncAdjustmentCategoryUi() {
  syncOverrideAvailability();

  const isOverride =
    categoryInput?.value ===
    "verified_experience_override";

  if (amountField) {
    amountField.hidden =
      isOverride;
  }

  if (verifiedExperienceField) {
    verifiedExperienceField.hidden =
      !isOverride;
  }

  if (managementRecognitionField) {
    managementRecognitionField.hidden =
      !isOverride;
  }

  if (amountInput) {
    amountInput.required =
      !isOverride;

    if (isOverride) {
      amountInput.value = "";
    }
  }

  if (verifiedExperienceYears) {
    verifiedExperienceYears.required =
      isOverride;

    if (!isOverride) {
      verifiedExperienceYears.value = "";
    }
  }

  if (managementRecognitionXp) {
    managementRecognitionXp.required =
      isOverride;

    if (!isOverride) {
      managementRecognitionXp.value = "";
    }
  }

  if (!isOverride) {
    syncRecognitionInput();
  }
}

categoryInput?.addEventListener(
  "change",
  syncAdjustmentCategoryUi
);

verifiedExperienceYears?.addEventListener(
  "change",
  syncRecognitionInput
);

managementRecognitionXp?.addEventListener(
  "input",
  renderRecognitionBreakdown
);

syncAdjustmentCategoryUi();

function createAdjustmentId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    "xp",
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2, 10)
  ].join("-");
}

async function findMembers(search) {
  const response =
    await searchMembers({
      search
    });

  return Array.isArray(
    response.data?.members
  )
    ? response.data.members
    : [];
}

searchForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const search =
      clean(searchInput.value);

    if (search.length < 2) {
      setSearchStatus(
        "Enter an Athlete ID or at least two characters of the name.",
        true
      );

      return;
    }

    selectedAthlete.hidden = true;
    adjustmentPanel.hidden = true;
    athlete = null;

    searchResults.innerHTML = "";
    searchButton.disabled = true;

    setSearchStatus(
      "Searching existing athletes…"
    );

    try {
      const members =
        await findMembers(search);

      if (!members.length) {
        setSearchStatus(
          "No athlete found in your Management scope."
        );

        return;
      }

      if (members.length === 1) {
        renderAthlete(
          members[0]
        );

        return;
      }

      setSearchStatus(
        `${members.length} athletes found. Select one.`
      );

      searchResults.innerHTML =
        members.map(
          (member, index) => `
            <button
              class="result-button"
              type="button"
              data-result-index="${index}"
            >
              <strong>
                ${esc(member.name)}
              </strong>

              <span>
                ${esc(member.athleteId)}
              </span>
            </button>
          `
        ).join("");

      searchResults
        .querySelectorAll(
          "[data-result-index]"
        )
        .forEach(
          (button) => {
            button.addEventListener(
              "click",
              () => {
                renderAthlete(
                  members[
                    Number(
                      button.dataset.resultIndex
                    )
                  ]
                );
              }
            );
          }
        );

    } catch (error) {
      console.error(
        "[management-xp-adjustments] search failed",
        error
      );

      setSearchStatus(
        error?.message ||
        "Unable to search athletes.",
        true
      );

    } finally {
      searchButton.disabled = false;
    }
  }
);

adjustmentForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!athlete?.athleteId) {
      setAdjustmentStatus(
        "Select an athlete first.",
        true
      );

      return;
    }

    if (!selectedDiscipline) {
      setAdjustmentStatus(
        "Select the discipline to adjust.",
        true
      );

      return;
    }

    const category =
      clean(
        categoryInput.value
      );

    const isExperienceOverride =
      category ===
      "verified_experience_override";

    const recognitionPlan =
      isExperienceOverride
        ? selectedRecognitionPlan()
        : null;

    const amount =
      isExperienceOverride
        ? Number(
            recognitionPlan?.now || 0
          )
        : Number(
            amountInput.value
          );

    const reason =
      clean(
        reasonInput.value
      );

    if (!category) {
      setAdjustmentStatus(
        "Select an adjustment category.",
        true
      );

      return;
    }

    if (
      isExperienceOverride &&
      !recognitionPlan
    ) {
      setAdjustmentStatus(
        "Select the verified experience year and a valid XP-per-stage amount.",
        true
      );

      return;
    }

    if (
      !isExperienceOverride &&
      (
        !Number.isInteger(amount) ||
        amount <= 0
      )
    ) {
      setAdjustmentStatus(
        "XP amount must be a positive whole number.",
        true
      );

      return;
    }

    if (!reason) {
      setAdjustmentStatus(
        "Document the reason for this adjustment.",
        true
      );

      return;
    }

    const message = [
      "Apply this Management XP adjustment?",
      "",
      `${athlete.name} (${athlete.athleteId})`,
      `${disciplineLabel(selectedDiscipline)}`,
      `${categoryLabel(category)}`,
      isExperienceOverride
        ? `${recognitionPlan.total} XP total — ${recognitionPlan.now} now${recognitionPlan.held ? ` + ${recognitionPlan.held} held for Tier 1` : ""}`
        : `+${amount} XP`,
      "",
      reason,
      "",
      "This action will be written to the athlete XP audit trail."
    ].join("\n");

    if (
      !window.confirm(message)
    ) {
      return;
    }

    const adjustmentId =
      createAdjustmentId();

    applyButton.disabled = true;
    clearButton.disabled = true;

    setAdjustmentStatus(
      "Applying verified XP adjustment…"
    );

    try {
      const response =
        await createAdjustment({
          athleteUid:
            athlete.athleteId,

          discipline:
            selectedDiscipline,

          amount,

          verifiedExperienceYears:
            isExperienceOverride
              ? Number(
                  verifiedExperienceYears.value
                )
              : null,

          recognitionTotal:
            isExperienceOverride
              ? recognitionPlan.total
              : null,

          reason,

          category,

          adjustmentId
        });

      const result =
        response.data || {};

      const applied =
        Number(
          result.delta ??
          result.appliedXp ??
          amount
        );

      const duplicate =
        result.duplicate === true ||
        result.idempotent === true;

      setAdjustmentStatus(
        duplicate
          ? "This adjustment was already recorded. No duplicate XP was added."
          : isExperienceOverride
            ? `Verified experience recorded. ${recognitionPlan.total} XP total — ${applied} now${recognitionPlan.held ? ` + ${recognitionPlan.held} held for Tier 1` : ""}.`
            : `Adjustment recorded successfully. +${applied} XP applied.`
      );

      adjustmentForm.insertAdjacentHTML(
        "beforeend",
        `
          <div class="adjustment-success">
            <strong>
              Adjustment Recorded
            </strong>

            <p>
              ${esc(athlete.name)}
              ·
              ${esc(athlete.athleteId)}
              ·
              ${esc(
                disciplineLabel(
                  selectedDiscipline
                )
              )}
              ·
              ${esc(categoryLabel(category))}
              ·
              ${isExperienceOverride
                ? `${esc(recognitionPlan.total)} XP total · ${esc(applied)} now${recognitionPlan.held ? ` · ${esc(recognitionPlan.held)} held` : ""}`
                : `+${esc(applied)} XP`}
            </p>
          </div>
        `
      );

      if (isExperienceOverride) {
        athlete.priorExperienceRecognitionUsed = true;
      }

      categoryInput.value = "";
      amountInput.value = "";
      if (verifiedExperienceYears) {
        verifiedExperienceYears.value = "";
      }
      if (managementRecognitionXp) {
        managementRecognitionXp.value = "";
      }
      reasonInput.value = "";
      syncAdjustmentCategoryUi();

    } catch (error) {
      console.error(
        "[management-xp-adjustments] adjustment failed",
        error
      );

      const message =
        clean(error?.message);

      setAdjustmentStatus(
        message.includes(
          "XP_CAP_REACHED"
        )
          ? "This athlete has already reached the active-rank XP cap."
          : message.includes(
              "VERIFIED_EXPERIENCE_OVERRIDE_ALREADY_USED"
            )
            ? "Verified experience has already been recognized for this athlete. The one-time override is no longer available."
            : message ||
              "Unable to apply XP adjustment.",
        true
      );

    } finally {
      applyButton.disabled = false;
      clearButton.disabled = false;
    }
  }
);

clearButton.addEventListener(
  "click",
  clearAdjustmentFields
);
