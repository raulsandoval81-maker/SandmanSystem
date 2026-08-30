export const MANAGEMENT_LIFECYCLE_STAGES = Object.freeze([
  { id: "interest", label: "Interest" },
  { id: "lead", label: "Lead" },
  { id: "appointment", label: "Appointment" },
  { id: "outcome", label: "Outcome" },
  { id: "prospect-builder", label: "Prospect Builder" },
  { id: "review", label: "Review" },
  { id: "approval", label: "Approval" },
  { id: "checkout", label: "Checkout" },
  { id: "enrollment", label: "Enrollment" },
  { id: "intake", label: "Intake" },
  { id: "activation", label: "Activation" }
]);

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
