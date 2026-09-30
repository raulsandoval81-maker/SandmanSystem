export const MANAGEMENT_LIFECYCLE_STAGES = Object.freeze([
  { id: "interest", label: "Interest" },
  { id: "lead", label: "Lead" },
  { id: "appointment", label: "Appointment" },
  { id: "outcome", label: "Outcome" },
  { id: "prospect-builder", label: "Prospect Builder" },
  { id: "review-approve", label: "Proposal Signature" },
  { id: "checkout-enrollment", label: "Checkout & Enrollment" },
  { id: "intake-activation", label: "Intake & Activation" }
]);

export function visibleStageForProposalStatus(status = "") {
  const normalized = String(status || "").trim().toUpperCase();

  if (["BUILDING", "DRAFT"].includes(normalized)) {
    return "prospect-builder";
  }

  if ([
    "REVIEW",
    "AWAITING_CLIENT_SIGNATURE",
    "CLIENT_CHANGES_REQUESTED",
    "CLIENT_SIGNED"
  ].includes(normalized)) {
    return "review-approve";
  }

  if ([
    "READY_FOR_CHECKOUT",
    "CHECKOUT_CREATED",
    "PAID"
  ].includes(normalized)) {
    return "checkout-enrollment";
  }

  return "";
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stageIndex(stageId = "") {
  return MANAGEMENT_LIFECYCLE_STAGES.findIndex(
    (stage) => stage.id === stageId
  );
}

export function renderManagementLifecycle(
  target,
  {
    currentStage,
    completedThrough = "",
    completedStages = [],
    currentLabel = "",
    guidance = "",
    caseLabel = "",
    listOnly = false
  } = {}
) {
  if (!target) return;

  const currentIndex = stageIndex(currentStage);
  const completedIndex = stageIndex(completedThrough);
  const explicitCompleted = new Set(completedStages);

  const listMarkup = `
    <ol class="management-lifecycle__list">
      ${MANAGEMENT_LIFECYCLE_STAGES.map((stage, index) => {
        const isCurrent = index === currentIndex;
        const isComplete =
          !isCurrent &&
          (
            explicitCompleted.has(stage.id) ||
            (completedIndex >= 0 && index <= completedIndex)
          );

        const state = isCurrent
          ? "current"
          : isComplete
            ? "complete"
            : "future";

        return `
          <li class="management-lifecycle__stage is-${state}"
              data-lifecycle-stage="${stage.id}"
              ${isCurrent ? 'aria-current="step"' : ""}>
            <span class="management-lifecycle__marker" aria-hidden="true">
              ${isComplete ? "✓" : isCurrent ? "→" : "○"}
            </span>
            <span>${stage.label}</span>
          </li>
        `;
      }).join("")}
    </ol>
  `;

  if (listOnly) {
    target.innerHTML = listMarkup;
    return;
  }

  target.innerHTML = `
    <div class="management-lifecycle__heading">
      <div>
        <span class="management-lifecycle__eyebrow">Current Case Stage</span>
        <strong>${esc(
          currentLabel ||
          MANAGEMENT_LIFECYCLE_STAGES[currentIndex]?.label ||
          "Case Status"
        )}</strong>
      </div>
      ${
        caseLabel
          ? `<span class="management-lifecycle__case">${esc(caseLabel)}</span>`
          : ""
      }
    </div>

    ${listMarkup}

    ${
      guidance
        ? `<p class="management-lifecycle__guidance"><strong>Next:</strong> ${esc(guidance)}</p>`
        : ""
    }
  `;
}

function installProspectBuilderActionGuidance() {
  if (
    !window.location.pathname.startsWith(
      "/connect/admissions/calculator/"
    )
  ) {
    return;
  }

  const originalAlert =
    window.alert.bind(window);

  window.alert = (message) => {
    const current =
      String(message || "").trim();

    if (current === "Proposal sent for remote review.") {
      originalAlert(
        "Proposal sent. Awaiting confirmation receipt."
      );
      return;
    }

    if (/^Proposal sent to .+\.$/.test(current)) {
      originalAlert(
        `${current} Awaiting confirmation receipt.`
      );
      return;
    }

    originalAlert(message);
  };

  const actions =
    document.querySelector(".workflow-actions");

  if (!actions) {
    return;
  }

  if (!actions.dataset.stepGuidanceInstalled) {
    const note =
      document.createElement("p");

    note.className =
      "proposal-action-guidance";

    note.textContent =
      "Step 1: save the proposal draft. Step 2: choose how the family will sign — remote or in person.";

    note.style.margin =
      "0 0 10px";
    note.style.width =
      "100%";
    note.style.fontSize =
      ".82rem";
    note.style.lineHeight =
      "1.45";
    note.style.opacity =
      ".75";

    actions.parentElement?.insertBefore(
      note,
      actions
    );

    actions.dataset.stepGuidanceInstalled =
      "true";
  }

  const normalizeButtons = () => {
    const save =
      document.getElementById("saveDraftButton");
    const remote =
      document.getElementById("sendReviewButton");
    const local =
      document.getElementById("submitReviewButton");

    if (save) {
      save.style.order = "1";

      const text =
        String(save.textContent || "").trim();

      if (text === "Save Draft") {
        save.textContent = "1. Save Draft";
      } else if (text === "Saving…") {
        save.textContent = "1. Saving…";
      } else if (text.startsWith("Saved ")) {
        save.textContent =
          `1. Draft Saved — ${text.slice(6)}`;
      }
    }

    if (remote) {
      remote.style.order = "2";

      const text =
        String(remote.textContent || "").trim();

      if (
        text === "Send for Review — Remote" ||
        text === "Send for Signature — Remote"
      ) {
        remote.textContent =
          "2A. Send for Signature — Remote";
      } else if (text === "Sending…") {
        remote.textContent = "2A. Sending…";
      }

      remote.title =
        "Email the finalized proposal for signature. After the family signs, checkout continues automatically.";
    }

    if (local) {
      local.style.order = "3";

      const text =
        String(local.textContent || "").trim();

      if (
        text === "Submit for Review — In Person" ||
        text === "Open for Signature — In Person"
      ) {
        local.textContent =
          "2B. Open for Signature — In Person";
      } else if (text === "Opening Review…") {
        local.textContent =
          "2B. Opening Signature…";
      }

      local.title =
        "Open the finalized proposal for the family to sign on this device. After signature, checkout continues automatically.";
    }

    if (
      save &&
      remote &&
      local &&
      !(
        save.nextElementSibling === remote &&
        remote.nextElementSibling === local
      )
    ) {
      actions.append(save, remote, local);
    }
  };

  normalizeButtons();

  const observer =
    new MutationObserver(normalizeButtons);

  observer.observe(
    actions,
    {
      childList: true,
      subtree: true,
      characterData: true
    }
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    installProspectBuilderActionGuidance,
    { once: true }
  );
} else {
  installProspectBuilderActionGuidance();
}
