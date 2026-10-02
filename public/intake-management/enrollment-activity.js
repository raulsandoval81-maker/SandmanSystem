import {
  db,
  functions,
  httpsCallable,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";

const proposalId = String(
  new URLSearchParams(location.search)
    .get("proposalId") || ""
).trim();

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
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function eventTime(item = {}) {
  return item.occurredAt || item.createdAt || null;
}

function formatTimestamp(value) {
  const valueMillis = millis(value);
  if (!valueMillis) return "Time pending";
  return new Date(valueMillis).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function eventLabel(item = {}) {
  const event = String(item.event || "").trim().toUpperCase();
  const labels = {
    CREATED: "Proposal created",
    CLIENT_REVIEW_ISSUED: "Client review issued",
    CLIENT_REVIEW_EMAIL_SENT: "Client review email sent",
    CLIENT_SIGNED: "Client signed",
    CHECKOUT_RESTARTED: "Checkout restarted",
    INTAKE_INVITE_CREATED: "Intake invite created",
    INTAKE_INVITE_SENT: "Intake email sent",
    INTAKE_SUBMITTED: "Intake submitted",
    ATHLETE_ACTIVATED: "Athlete activated"
  };

  if (labels[event]) return labels[event];
  if (event === "STATUS_CHANGED" && item.fromStatus && item.toStatus) {
    return `${item.fromStatus} → ${item.toStatus}`;
  }

  return event
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Enrollment activity";
}

function eventDetail(item = {}) {
  if (item.event === "INTAKE_INVITE_CREATED") {
    return item.intakeAudience === "adult_athlete"
      ? "Adult athlete intake handoff"
      : "Parent / guardian intake handoff";
  }

  if (item.event === "INTAKE_INVITE_SENT") {
    return item.recipient
      ? `Sent to ${item.recipient}`
      : "Secure intake link emailed";
  }

  if (item.event === "INTAKE_SUBMITTED") {
    return item.intakeAudience === "adult_athlete"
      ? "Submitted by adult athlete"
      : "Submitted by parent / guardian";
  }

  if (item.event === "ATHLETE_ACTIVATED") {
    return item.athleteUid ? `Athlete ${item.athleteUid}` : "Athlete profile activated";
  }

  const actor = item.createdByName || item.createdBy || "";
  return actor ? `By ${actor}` : "";
}

function placementLabel(item = {}) {
  const event = String(item.event || "").trim().toUpperCase();

  if (event === "COACH_ASSESSMENT_SENT") {
    return "Coach Assessment Sent";
  }

  if (event === "COACH_ASSESSMENT_RETURNED") {
    return "Returned to Management";
  }

  if (event === "EXPERIENCE_VALIDATED") {
    return "Experience Validation";
  }

  if (event === "PLACEMENT_RECORDED") {
    return "Placement Recorded";
  }

  return eventLabel(item);
}

function placementDetail(item = {}) {
  const parts = [];
  const discipline = String(item.discipline || "").trim();
  const outcome = String(item.outcome || "").trim().toUpperCase();

  if (discipline) {
    parts.push(`Discipline: ${discipline}`);
  }

  if (item.event === "EXPERIENCE_VALIDATED" && outcome) {
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

function timelineItem({ label, detail, createdAt }) {
  return `
    <li class="enrollment-activity__item">
      <span class="enrollment-activity__dot" aria-hidden="true"></span>
      <div>
        <strong>${esc(label)}</strong>
        <span>${esc(formatTimestamp(createdAt))}</span>
        ${detail ? `<small>${esc(detail)}</small>` : ""}
      </div>
    </li>
  `;
}

function sectionHtml(title, description, items) {
  return `
    <section class="enrollment-activity__phase">
      <div class="enrollment-activity__phase-head">
        <div>
          <h4>${esc(title)}</h4>
          <p>${esc(description)}</p>
        </div>
        <span>${items.length}</span>
      </div>
      ${items.length
        ? `<ol class="enrollment-activity__list">${items.map(timelineItem).join("")}</ol>`
        : `<p class="enrollment-activity__empty">No activity recorded in this phase yet.</p>`}
    </section>
  `;
}

function installStyles() {
  if (document.getElementById("enrollmentActivityStyles")) return;
  const style = document.createElement("style");
  style.id = "enrollmentActivityStyles";
  style.textContent = `
    .enrollment-activity{display:grid;gap:18px;margin:18px 0 24px;padding:20px;border:1px solid var(--management-border);border-radius:16px;background:var(--management-surface);color:var(--management-text)}
    .enrollment-activity__head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .enrollment-activity__head h3,.enrollment-activity__phase h4{margin:0}
    .enrollment-activity__head p,.enrollment-activity__phase-head p{margin:5px 0 0;color:var(--management-muted);line-height:1.45}
    .enrollment-activity__case{font:inherit;font-weight:850;color:var(--management-muted)}
    .enrollment-activity__phase{display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--management-border)}
    .enrollment-activity__phase-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .enrollment-activity__phase-head>span{min-width:30px;text-align:center;padding:5px 8px;border-radius:999px;background:var(--management-neutral-soft);font-weight:850}
    .enrollment-activity__list{display:grid;gap:0;margin:0;padding:0;list-style:none}
    .enrollment-activity__item{position:relative;display:grid;grid-template-columns:18px 1fr;gap:10px;min-height:58px;padding:4px 0 12px}
    .enrollment-activity__item:not(:last-child)::before{content:"";position:absolute;left:7px;top:18px;bottom:-2px;width:2px;background:var(--management-border)}
    .enrollment-activity__dot{position:relative;z-index:1;width:16px;height:16px;margin-top:2px;border:3px solid var(--management-surface);border-radius:50%;background:var(--management-gold);box-shadow:0 0 0 1px var(--management-border-strong)}
    .enrollment-activity__item div{display:grid;gap:3px}
    .enrollment-activity__item span,.enrollment-activity__item small,.enrollment-activity__empty{color:var(--management-muted)}
    .enrollment-activity__item span{font-size:.8rem}.enrollment-activity__item small{font-size:.78rem}.enrollment-activity__empty{margin:0;font-size:.85rem}
  `;
  document.head.appendChild(style);
}

async function renderEnrollmentActivity() {
  if (!proposalId) return;
  const anchor = document.getElementById("enrollmentCaseStatus");
  if (!anchor) return;

  installStyles();
  const panel = document.createElement("section");
  panel.id = "enrollmentActivity";
  panel.className = "enrollment-activity";
  panel.setAttribute("aria-label", "Enrollment activity");
  panel.innerHTML = `
    <div class="enrollment-activity__head">
      <div><h3>Enrollment Activity</h3><p>Chronological case history from proposal through placement.</p></div>
      <span class="enrollment-activity__case">${esc(proposalId)}</span>
    </div>
    <p class="enrollment-activity__empty">Loading activity…</p>
  `;
  anchor.insertAdjacentElement("afterend", panel);

  try {
    await requireManagement();

    const [historySnapshot, placementResult] = await Promise.all([
      getDocs(collection(db, "proposals", proposalId, "history")),
      getPlacementActivity({ proposalId })
    ]);

    const enrollmentItems = historySnapshot.docs
      .map((historyDoc) => ({ id: historyDoc.id, ...historyDoc.data() }))
      .sort((a, b) => millis(eventTime(a)) - millis(eventTime(b)))
      .map((item) => ({
        label: eventLabel(item),
        detail: eventDetail(item),
        createdAt: eventTime(item)
      }));

    const placementItems = Array.isArray(placementResult?.data?.activity)
      ? placementResult.data.activity
          .slice()
          .sort((a, b) => millis(a.occurredAt) - millis(b.occurredAt))
          .map((item) => ({
            label: placementLabel(item),
            detail: placementDetail(item),
            createdAt: item.occurredAt
          }))
      : [];

    panel.innerHTML = `
      <div class="enrollment-activity__head">
        <div><h3>Enrollment Activity</h3><p>A-to-Z historical truth for this enrollment case.</p></div>
        <span class="enrollment-activity__case">${esc(proposalId)}</span>
      </div>
      ${sectionHtml("Enrollment", "Proposal through athlete activation.", enrollmentItems)}
      ${sectionHtml("Placement & Onboarding", "Coach assessment through Management validation and placement.", placementItems)}
    `;
  } catch (error) {
    console.error("[enrollment-activity] failed:", error);
    panel.innerHTML = `
      <div class="enrollment-activity__head">
        <div><h3>Enrollment Activity</h3><p>Timeline could not be loaded.</p></div>
        <span class="enrollment-activity__case">${esc(proposalId)}</span>
      </div>
      <p class="enrollment-activity__empty">${esc(error?.message || "Unable to load enrollment activity.")}</p>
    `;
  }
}

renderEnrollmentActivity();
