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

  const proposalItems = historySnapshot.docs
    .map((historyDoc) => ({
      id: historyDoc.id,
      ...historyDoc.data()
    }))
    .sort(
      (a, b) =>
        millis(eventTime(a)) -
        millis(eventTime(b))
    )
    .map((item) => ({
      label: eventLabel(item),
      detail: eventDetail(item),
      createdAt: eventTime(item)
    }));

  const placementItems =
    Array.isArray(placementResult?.data?.activity)
      ? placementResult.data.activity
          .slice()
          .sort(
            (a, b) =>
              millis(a.occurredAt) -
              millis(b.occurredAt)
          )
          .map((item) => ({
            label: placementLabel(item),
            detail: placementDetail(item),
            createdAt: item.occurredAt
          }))
      : [];

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
