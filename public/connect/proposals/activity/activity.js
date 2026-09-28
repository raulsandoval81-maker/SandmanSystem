import {
  db,
  functions,
  httpsCallable,
  doc,
  getDoc,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";

const proposalId = String(
  new URLSearchParams(window.location.search)
    .get("proposalId") || ""
).trim();

const card =
  document.getElementById("activityCard");

const subtitle =
  document.getElementById("activitySubtitle");

const getPlacementActivity =
  httpsCallable(
    functions,
    "getEnrollmentPlacementActivity"
  );

const lifecycle = [
  {
    key: "proposal",
    label: "Proposal Created",
    description: "Family proposal record exists."
  },
  {
    key: "review",
    label: "Client Review",
    description: "Proposal is issued for family review."
  },
  {
    key: "signature",
    label: "Client Signature",
    description: "Family accepts and signs the proposal."
  },
  {
    key: "checkout",
    label: "Checkout",
    description: "Approved pricing moves into Stripe checkout."
  },
  {
    key: "payment",
    label: "Payment",
    description: "Required enrollment payment is completed."
  },
  {
    key: "intake",
    label: "Intake",
    description: "Secure athlete or parent intake is completed."
  },
  {
    key: "activation",
    label: "Athlete Activation",
    description: "Athlete profile is activated by Management."
  },
  {
    key: "coach_assessment",
    label: "Coach Assessment",
    description: "Athlete is sent to Coach for assessment."
  },
  {
    key: "management_validation",
    label: "Management Validation",
    description: "Experience and returned assessment are reviewed."
  },
  {
    key: "placement",
    label: "Placement",
    description: "Final placement is recorded."
  }
];

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
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();

  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.getTime()
    : 0;
}

function eventTime(item = {}) {
  return item.occurredAt || item.createdAt || null;
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

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }
  ).format(Number.isFinite(amount) ? amount : 0);
}

function statusLabel(value = "") {
  const key = String(value || "").toUpperCase();
  return ({
    BUILDING: "Building",
    DRAFT: "Draft",
    REVIEW: "Needs Review",
    AWAITING_CLIENT_SIGNATURE: "Awaiting Client Signature",
    CLIENT_CHANGES_REQUESTED: "Client Changes Requested",
    CLIENT_SIGNED: "Client Signed",
    READY_FOR_CHECKOUT: "Checkout Ready",
    CHECKOUT_CREATED: "Checkout Created",
    PAYMENT_PENDING: "Payment Pending",
    PAID: "Paid",
    VOID: "Void"
  })[key] || key || "Unknown";
}

function eventLabel(item = {}) {
  const event = String(item.event || "")
    .trim()
    .toUpperCase();

  const labels = {
    CREATED: "Proposal Created",
    CLIENT_REVIEW_ISSUED: "Client Review Issued",
    CLIENT_REVIEW_EMAIL_SENT: "Remote Review Email Sent",
    CLIENT_SIGNED: "Client Signed",
    CHECKOUT_CREATED: "Checkout Created",
    CHECKOUT_RESTARTED: "Checkout Restarted",
    PAYMENT_PENDING: "Payment Pending",
    PAID: "Payment Complete",
    INTAKE_INVITE_CREATED: "Intake Invite Created",
    INTAKE_SUBMITTED: "Intake Submitted",
    ATHLETE_ACTIVATED: "Athlete Activated"
  };

  if (labels[event]) {
    return labels[event];
  }

  if (
    event === "STATUS_CHANGED" &&
    item.fromStatus &&
    item.toStatus
  ) {
    return `${item.fromStatus} → ${item.toStatus}`;
  }

  return event
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) =>
      part.charAt(0).toUpperCase() +
      part.slice(1)
    )
    .join(" ") || "Proposal Activity";
}

function eventDetail(item = {}) {
  const parts = [];
  const delivery = String(item.delivery || "")
    .trim()
    .toLowerCase();

  if (delivery === "email") {
    parts.push("Remote review");
  } else if (delivery === "local") {
    parts.push("In-person review");
  }

  if (
    item.event === "CLIENT_REVIEW_EMAIL_SENT" &&
    item.to
  ) {
    parts.push(`Sent to ${item.to}`);
  }

  if (item.event === "INTAKE_INVITE_CREATED") {
    parts.push(
      item.intakeAudience === "adult_athlete"
        ? "Adult athlete intake handoff"
        : "Parent / guardian intake handoff"
    );
  }

  if (item.event === "INTAKE_SUBMITTED") {
    parts.push(
      item.intakeAudience === "adult_athlete"
        ? "Submitted by adult athlete"
        : "Submitted by parent / guardian"
    );
  }

  if (
    item.event === "ATHLETE_ACTIVATED" &&
    item.athleteUid
  ) {
    parts.push(`Athlete ${item.athleteUid}`);
  }

  const actor =
    item.createdByName ||
    item.createdBy ||
    "";

  if (actor) {
    parts.push(`By ${actor}`);
  }

  return parts.join(" · ");
}

function placementLabel(item = {}) {
  const event = String(item.event || "")
    .trim()
    .toUpperCase();

  return ({
    COACH_ASSESSMENT_SENT: "Coach Assessment Sent",
    COACH_ASSESSMENT_RETURNED: "Returned to Management",
    EXPERIENCE_VALIDATED: "Experience Validation",
    PLACEMENT_RECORDED: "Placement Recorded"
  })[event] || eventLabel(item);
}

function placementDetail(item = {}) {
  const parts = [];
  const discipline = String(item.discipline || "").trim();
  const outcome = String(item.outcome || "")
    .trim()
    .toUpperCase();

  if (discipline) {
    parts.push(`Discipline: ${discipline}`);
  }

  if (
    item.event === "EXPERIENCE_VALIDATED" &&
    outcome
  ) {
    parts.push(
      outcome === "REJECTED"
        ? "Rejected"
        : outcome === "AWARDED"
          ? "Approved"
          : outcome
    );
  }

  return parts.join(" · ");
}

function timelineItem(item) {
  return `
    <li class="activity-item">
      <span class="activity-dot" aria-hidden="true"></span>
      <div>
        <strong>${esc(item.label)}</strong>
        <span>${esc(formatTimestamp(item.createdAt))}</span>
        ${item.detail ? `<small>${esc(item.detail)}</small>` : ""}
      </div>
    </li>
  `;
}

function phase(title, description, items) {
  return `
    <section class="activity-phase">
      <div class="activity-phase-head">
        <div>
          <h2>${esc(title)}</h2>
          <p>${esc(description)}</p>
        </div>
        <span class="activity-count">${items.length}</span>
      </div>
      ${
        items.length
          ? `<ol class="activity-list">${items.map(timelineItem).join("")}</ol>`
          : `<p class="activity-empty">No activity recorded in this phase yet.</p>`
      }
    </section>
  `;
}

function lifecycleState(
  proposal,
  historyRecords,
  placementRecords
) {
  const complete = new Set(["proposal"]);
  const historyEvents = new Set(
    historyRecords.map((item) =>
      String(item.event || "").trim().toUpperCase()
    )
  );
  const placementEvents = new Set(
    placementRecords.map((item) =>
      String(item.event || "").trim().toUpperCase()
    )
  );
  const status = String(proposal.status || "")
    .trim()
    .toUpperCase();

  if (
    historyEvents.has("CLIENT_REVIEW_ISSUED") ||
    historyEvents.has("CLIENT_REVIEW_EMAIL_SENT") ||
    [
      "AWAITING_CLIENT_SIGNATURE",
      "CLIENT_SIGNED",
      "READY_FOR_CHECKOUT",
      "CHECKOUT_CREATED",
      "PAYMENT_PENDING",
      "PAID"
    ].includes(status)
  ) {
    complete.add("review");
  }

  if (
    historyEvents.has("CLIENT_SIGNED") ||
    [
      "CLIENT_SIGNED",
      "READY_FOR_CHECKOUT",
      "CHECKOUT_CREATED",
      "PAYMENT_PENDING",
      "PAID"
    ].includes(status)
  ) {
    complete.add("signature");
  }

  if (
    historyEvents.has("CHECKOUT_CREATED") ||
    historyEvents.has("CHECKOUT_RESTARTED") ||
    [
      "CHECKOUT_CREATED",
      "PAYMENT_PENDING",
      "PAID"
    ].includes(status)
  ) {
    complete.add("checkout");
  }

  if (
    historyEvents.has("PAID") ||
    status === "PAID"
  ) {
    complete.add("payment");
  }

  if (
    historyEvents.has("INTAKE_SUBMITTED") ||
    historyEvents.has("ATHLETE_ACTIVATED")
  ) {
    complete.add("intake");
  }

  if (historyEvents.has("ATHLETE_ACTIVATED")) {
    complete.add("activation");
  }

  if (
    placementEvents.has("COACH_ASSESSMENT_SENT") ||
    placementEvents.has("COACH_ASSESSMENT_RETURNED") ||
    placementEvents.has("EXPERIENCE_VALIDATED") ||
    placementEvents.has("PLACEMENT_RECORDED")
  ) {
    complete.add("coach_assessment");
  }

  if (
    placementEvents.has("EXPERIENCE_VALIDATED") ||
    placementEvents.has("PLACEMENT_RECORDED")
  ) {
    complete.add("management_validation");
  }

  if (placementEvents.has("PLACEMENT_RECORDED")) {
    complete.add("placement");
  }

  const current = lifecycle.find(
    (step) => !complete.has(step.key)
  )?.key || "placement";

  return {
    complete,
    current
  };
}

function lifecycleHtml(
  proposal,
  historyRecords,
  placementRecords
) {
  const state = lifecycleState(
    proposal,
    historyRecords,
    placementRecords
  );

  return `
    <section class="activity-lifecycle" aria-label="Case lifecycle">
      <div class="activity-lifecycle-head">
        <div>
          <h2>Full Case Chain</h2>
          <p>
            Completed steps are active. The current step is highlighted.
            Future steps stay visible but inactive until the system records them.
          </p>
        </div>
      </div>

      <ol class="activity-lifecycle-list">
        ${lifecycle.map((step, index) => {
          const isComplete = state.complete.has(step.key);
          const isCurrent = state.current === step.key && !isComplete;
          const className = isComplete
            ? "is-complete"
            : isCurrent
              ? "is-current"
              : "is-pending";
          const stateLabel = isComplete
            ? "Completed"
            : isCurrent
              ? "Current"
              : "Waiting";

          return `
            <li class="activity-lifecycle-step ${className}">
              <span class="activity-lifecycle-number">${index + 1}</span>
              <div>
                <strong>${esc(step.label)}</strong>
                <small>${esc(step.description)}</small>
              </div>
              <span class="activity-lifecycle-state">${stateLabel}</span>
            </li>
          `;
        }).join("")}
      </ol>
    </section>
  `;
}

async function load() {
  if (!proposalId) {
    throw new Error("A proposalId is required.");
  }

  await requireManagement();

  const proposalSnap =
    await getDoc(
      doc(db, "proposals", proposalId)
    );

  if (!proposalSnap.exists()) {
    throw new Error(`Proposal ${proposalId} was not found.`);
  }

  const proposal = proposalSnap.data() || {};
  const pricing = proposal.pricing || {};
  const familyName =
    proposal.prospect?.familyName ||
    proposal.prospect?.primaryContactName ||
    "Unnamed Family";

  const [historySnapshot, placementResult] =
    await Promise.all([
      getDocs(
        collection(
          db,
          "proposals",
          proposalId,
          "history"
        )
      ),
      getPlacementActivity({ proposalId })
    ]);

  const historyRecords = historySnapshot.docs
    .map((historyDoc) => ({
      id: historyDoc.id,
      ...historyDoc.data()
    }))
    .sort(
      (a, b) =>
        millis(eventTime(a)) -
        millis(eventTime(b))
    );

  const placementRecords =
    Array.isArray(placementResult?.data?.activity)
      ? placementResult.data.activity
          .slice()
          .sort(
            (a, b) =>
              millis(a.occurredAt) -
              millis(b.occurredAt)
          )
      : [];

  const proposalItems = historyRecords
    .map((item) => ({
      label: eventLabel(item),
      detail: eventDetail(item),
      createdAt: eventTime(item)
    }));

  const placementItems = placementRecords
    .map((item) => ({
      label: placementLabel(item),
      detail: placementDetail(item),
      createdAt: item.occurredAt
    }));

  subtitle.textContent =
    `${proposalId} · ${familyName}`;

  card.innerHTML = `
    <div class="activity-summary">
      <div>
        <small>Proposal</small>
        <strong>${esc(proposalId)}</strong>
      </div>
      <div>
        <small>Status</small>
        <strong>${esc(statusLabel(proposal.status))}</strong>
      </div>
      <div>
        <small>Monthly</small>
        <strong>${esc(money(pricing.monthlyBalance))}</strong>
      </div>
      <div>
        <small>Due Now</small>
        <strong>${esc(money(pricing.dueNow))}</strong>
      </div>
    </div>

    ${lifecycleHtml(
      proposal,
      historyRecords,
      placementRecords
    )}

    ${phase(
      "Proposal & Enrollment",
      "Chronological history for this exact proposal record through payment and athlete activation.",
      proposalItems
    )}

    ${phase(
      "Placement & Onboarding",
      "Coach assessment through Management validation and placement.",
      placementItems
    )}
  `;
}

load().catch((error) => {
  console.error("[proposal-activity-view] failed:", error);

  subtitle.textContent =
    proposalId || "Proposal activity unavailable";

  card.innerHTML = `
    <p class="activity-empty">
      ${esc(error?.message || "Unable to load proposal activity.")}
    </p>
  `;
});
