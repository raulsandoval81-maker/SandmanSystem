import {
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const proposalId = String(
  new URLSearchParams(window.location.search)
    .get("proposalId") || ""
).trim();

const card =
  document.getElementById("activityCard");

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function millis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTimestamp(value) {
  const time = millis(value);
  if (!time) return "Time pending";
  return new Date(time).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function installLifecycleOrderCorrection() {
  if (!card) return;

  const render = () => {
    const lifecycleSection =
      card.querySelector(".activity-lifecycle");
    const list =
      lifecycleSection?.querySelector(".activity-lifecycle-list");

    if (!lifecycleSection || !list) {
      return false;
    }

    const steps = Array.from(
      list.querySelectorAll(".activity-lifecycle-step")
    );

    const findStep = (label) =>
      steps.find((step) =>
        step.querySelector("strong")?.textContent?.trim() === label
      );

    const activation = findStep("Athlete Activation");
    const placement =
      findStep("Placement") ||
      findStep("Starting Placement");
    const coachAssessment = findStep("Coach Assessment");
    const managementValidation = findStep("Management Validation");

    if (
      !activation ||
      !placement ||
      !coachAssessment ||
      !managementValidation
    ) {
      return false;
    }

    const placementTitle = placement.querySelector("strong");
    const placementDescription = placement.querySelector("small");

    if (placementTitle) {
      placementTitle.textContent = "Starting Placement";
    }

    if (placementDescription) {
      placementDescription.textContent =
        "Starting placement is established when the athlete is activated.";
    }

    list.insertBefore(placement, coachAssessment);

    if (activation.classList.contains("is-complete")) {
      placement.classList.remove(
        "is-pending",
        "is-current",
        "is-skipped"
      );
      placement.classList.add("is-complete");

      const placementState =
        placement.querySelector(".activity-lifecycle-state");
      if (placementState) {
        placementState.textContent = "Completed";
      }
    }

    const lifecycleCopy =
      lifecycleSection.querySelector(".activity-lifecycle-head p");

    if (lifecycleCopy) {
      lifecycleCopy.textContent =
        "Starting placement is established at activation. Coach assessment is optional and may refine that placement; Management validation is required only when returned Coach findings need review.";
    }

    Array.from(
      list.querySelectorAll(".activity-lifecycle-step")
    ).forEach((step, index) => {
      const number =
        step.querySelector(".activity-lifecycle-number");
      if (number) {
        number.textContent = String(index + 1);
      }
    });

    return true;
  };

  if (render()) return;

  const observer = new MutationObserver(() => {
    if (render()) {
      observer.disconnect();
    }
  });

  observer.observe(
    card,
    {
      childList: true,
      subtree: true
    }
  );
}

async function installCorrectionHistory() {
  if (!proposalId || !card) return;

  const history = await getDocs(
    collection(
      db,
      "proposals",
      proposalId,
      "history"
    )
  );

  const corrections = history.docs
    .map((item) => item.data() || {})
    .filter((item) =>
      String(item.reason || "").toUpperCase() ===
      "MANAGEMENT_CORRECTION"
    )
    .sort((a, b) =>
      millis(a.createdAt) - millis(b.createdAt)
    );

  if (!corrections.length) return;

  const render = () => {
    if (
      card.querySelector(
        "[data-correction-history]"
      )
    ) {
      return true;
    }

    if (
      card.querySelector(
        ".activity-empty"
      )
    ) {
      return false;
    }

    const section =
      document.createElement("section");

    section.className =
      "activity-phase";
    section.dataset.correctionHistory =
      "true";

    section.innerHTML = `
      <div class="activity-phase-head">
        <div>
          <h2>Corrections</h2>
          <p>Management corrections preserve the original history and explain why the proposal was reopened.</p>
        </div>
        <span class="activity-count">${corrections.length}</span>
      </div>
      <ol class="activity-list">
        ${corrections.map((item) => `
          <li class="activity-item">
            <span class="activity-dot" aria-hidden="true"></span>
            <div>
              <strong>Proposal Reopened for Correction</strong>
              <span>${esc(formatTimestamp(item.createdAt))}</span>
              <small>${esc(item.correctionReason || "Reason not recorded")}${item.createdByName ? ` · By ${esc(item.createdByName)}` : ""}</small>
            </div>
          </li>
        `).join("")}
      </ol>
    `;

    card.appendChild(section);
    return true;
  };

  if (render()) return;

  const observer =
    new MutationObserver(() => {
      if (render()) {
        observer.disconnect();
      }
    });

  observer.observe(
    card,
    {
      childList: true,
      subtree: true
    }
  );
}

installLifecycleOrderCorrection();

installCorrectionHistory().catch((error) => {
  console.error(
    "Unable to render proposal correction history:",
    error
  );
});
