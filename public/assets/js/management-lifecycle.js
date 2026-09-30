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
  const value = String(status || "").trim().toUpperCase();
  if (["BUILDING", "DRAFT"].includes(value)) return "prospect-builder";
  if (["REVIEW", "AWAITING_CLIENT_SIGNATURE", "CLIENT_CHANGES_REQUESTED", "CLIENT_SIGNED"].includes(value)) return "review-approve";
  if (["READY_FOR_CHECKOUT", "CHECKOUT_CREATED", "PAID"].includes(value)) return "checkout-enrollment";
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
  return MANAGEMENT_LIFECYCLE_STAGES.findIndex((stage) => stage.id === stageId);
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
        const isComplete = !isCurrent && (
          explicitCompleted.has(stage.id) ||
          (completedIndex >= 0 && index <= completedIndex)
        );
        const state = isCurrent ? "current" : isComplete ? "complete" : "future";
        return `
          <li class="management-lifecycle__stage is-${state}"
              data-lifecycle-stage="${stage.id}"
              ${isCurrent ? 'aria-current="step"' : ""}>
            <span class="management-lifecycle__marker" aria-hidden="true">
              ${isComplete ? "✓" : isCurrent ? "→" : "○"}
            </span>
            <span>${stage.label}</span>
          </li>`;
      }).join("")}
    </ol>`;

  if (listOnly) {
    target.innerHTML = listMarkup;
    return;
  }

  target.innerHTML = `
    <div class="management-lifecycle__heading">
      <div>
        <span class="management-lifecycle__eyebrow">Current Case Stage</span>
        <strong>${esc(currentLabel || MANAGEMENT_LIFECYCLE_STAGES[currentIndex]?.label || "Case Status")}</strong>
      </div>
      ${caseLabel ? `<span class="management-lifecycle__case">${esc(caseLabel)}</span>` : ""}
    </div>
    ${listMarkup}
    ${guidance ? `<p class="management-lifecycle__guidance"><strong>Next:</strong> ${esc(guidance)}</p>` : ""}`;
}

function installProspectBuilderActions() {
  if (!window.location.pathname.startsWith("/connect/admissions/calculator/")) return;

  const originalAlert = window.alert.bind(window);
  window.alert = (message) => {
    const text = String(message || "").trim();
    if (text === "Proposal sent for remote review.") {
      originalAlert("Proposal sent. Awaiting confirmation receipt.");
      return;
    }
    if (/^Proposal sent to .+\.$/.test(text)) {
      originalAlert(`${text} Awaiting confirmation receipt.`);
      return;
    }
    originalAlert(message);
  };

  const actions = document.querySelector(".workflow-actions");
  if (!actions) return;

  if (!actions.dataset.stepGuidanceInstalled) {
    const note = document.createElement("p");
    note.className = "proposal-action-guidance";
    note.textContent = "Step 1: save the proposal draft. Step 2: choose how the family will sign — remote or in person.";
    note.style.cssText = "margin:0 0 10px;width:100%;font-size:.82rem;line-height:1.45;opacity:.75";
    actions.parentElement?.insertBefore(note, actions);
    actions.dataset.stepGuidanceInstalled = "true";
  }

  const normalize = () => {
    const save = document.getElementById("saveDraftButton");
    const remote = document.getElementById("sendReviewButton");
    const local = document.getElementById("submitReviewButton");

    if (save) {
      const text = String(save.textContent || "").trim();
      if (text === "Save Draft") save.textContent = "1. Save Draft";
      else if (text === "Saving…") save.textContent = "1. Saving…";
      else if (text.startsWith("Saved ")) save.textContent = `1. Draft Saved — ${text.slice(6)}`;
    }

    if (remote) {
      const text = String(remote.textContent || "").trim();
      if (["Send for Review — Remote", "Send for Signature — Remote"].includes(text)) remote.textContent = "2A. Send for Signature — Remote";
      else if (text === "Sending…") remote.textContent = "2A. Sending…";
    }

    if (local) {
      const text = String(local.textContent || "").trim();
      if (["Submit for Review — In Person", "Open for Signature — In Person"].includes(text)) local.textContent = "2B. Open for Signature — In Person";
      else if (text === "Opening Review…") local.textContent = "2B. Opening Signature…";
    }

    if (save && remote && local && !(save.nextElementSibling === remote && remote.nextElementSibling === local)) {
      actions.append(save, remote, local);
    }
  };

  normalize();
  new MutationObserver(normalize).observe(actions, { childList: true, subtree: true, characterData: true });
}

function installIssuedProposalReceipt() {
  if (!window.location.pathname.startsWith("/connect/admissions/calculator/")) return;

  const proposalId = String(new URLSearchParams(window.location.search).get("proposalId") || "").trim();
  if (!proposalId) return;

  const workflow = document.getElementById("proposalWorkflow");
  const page = document.querySelector("main.page");
  if (!workflow || !page) return;

  let collapsed = false;

  const collapseIfIssued = () => {
    const stage = document.getElementById("proposalWorkflowStage");
    if (!stage) return;

    const current = String(stage.textContent || "").trim();
    if (current !== "Awaiting Client Signature" && current !== "Remote Proposal Sent") return;

    stage.textContent = "Remote Proposal Sent";

    const next = document.getElementById("proposalWorkflowNext");
    if (next) next.textContent = "Awaiting confirmation receipt. The family will sign and continue directly to checkout.";

    const route = document.getElementById("proposalWorkflowRoute");
    const routeLink = document.getElementById("proposalWorkflowRouteLink");
    if (route) route.hidden = false;
    if (routeLink) {
      routeLink.href = `/connect/proposals/activity/?proposalId=${encodeURIComponent(proposalId)}`;
      routeLink.textContent = "View Activity Receipt";
    }

    if (collapsed) return;
    collapsed = true;

    Array.from(page.children).forEach((child) => {
      if (child.matches("header") || child === workflow || child.dataset?.issuedReceipt === "true") return;
      child.hidden = true;
    });

    const receipt = document.createElement("section");
    receipt.dataset.issuedReceipt = "true";
    receipt.style.cssText = "margin-top:18px;padding:20px;border:1px solid rgba(255,255,255,.10);border-radius:16px";

    const title = document.createElement("h2");
    title.textContent = "Remote Send Receipt";
    title.style.margin = "0 0 8px";

    const copy = document.createElement("p");
    copy.textContent = "This proposal is already with the family. No resend or Builder action is required while confirmation is pending.";
    copy.style.cssText = "margin:0 0 14px;line-height:1.5";

    const idLine = document.createElement("p");
    idLine.textContent = `Proposal: ${proposalId}`;
    idLine.style.margin = "0 0 14px";

    const link = document.createElement("a");
    link.className = "button";
    link.href = `/connect/proposals/activity/?proposalId=${encodeURIComponent(proposalId)}`;
    link.textContent = "View Activity Receipt";

    receipt.append(title, copy, idLine, link);
    workflow.insertAdjacentElement("afterend", receipt);
  };

  collapseIfIssued();
  new MutationObserver(collapseIfIssued).observe(workflow, { childList: true, subtree: true, characterData: true });
}

function bootManagementLifecycleEnhancements() {
  installProspectBuilderActions();
  installIssuedProposalReceipt();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootManagementLifecycleEnhancements, { once: true });
} else {
  bootManagementLifecycleEnhancements();
}
