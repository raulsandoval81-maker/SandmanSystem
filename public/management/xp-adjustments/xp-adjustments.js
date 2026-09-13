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

const reasonInput =
  $("adjustmentReason");

const adjustmentStatus =
  $("adjustmentStatus");

const applyButton =
  $("applyAdjustmentButton");

const clearButton =
  $("clearAdjustmentButton");

let athlete = null;

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

function renderAthlete(member) {
  athlete = member;

  selectedAthlete.hidden = false;
  adjustmentPanel.hidden = false;

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

      ${summaryItem(
        "Track",
        member.trackBase || member.pathway
      )}

      ${summaryItem(
        "Rank",
        [
          member.tier,
          member.rankName
        ].filter(Boolean).join(" ")
      )}

      ${summaryItem(
        "Current XP",
        `${Number(member.xp || 0)} XP`
      )}
    </div>
  `;

  $("changeAthleteButton")
    ?.addEventListener(
      "click",
      clearAll
    );

  setSearchStatus(
    "Existing athlete selected."
  );

  searchResults.innerHTML = "";

  categoryInput.focus();
}

function clearAdjustmentFields() {
  categoryInput.value = "";
  amountInput.value = "";
  reasonInput.value = "";

  setAdjustmentStatus("");
}

function clearAll() {
  athlete = null;

  selectedAthlete.hidden = true;
  adjustmentPanel.hidden = true;

  selectedAthlete.innerHTML = "";
  searchResults.innerHTML = "";

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

    correction:
      "Correction"
  })[value] || value;
}

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

    const category =
      clean(
        categoryInput.value
      );

    const amount =
      Number(
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
      !Number.isInteger(amount) ||
      amount <= 0
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
      `${categoryLabel(category)}`,
      `+${amount} XP`,
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

          amount,

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
              ${esc(categoryLabel(category))}
              ·
              +${esc(applied)} XP
            </p>
          </div>
        `
      );

      categoryInput.value = "";
      amountInput.value = "";
      reasonInput.value = "";

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
