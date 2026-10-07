import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  requireCoach
} from "/assets/js/coach-guard.js";

const $ = (id) =>
  document.getElementById(id);

const listAssessmentPins =
  httpsCallable(
    functions,
    "listAthleteAssessmentPins"
  );

const OPEN_ASSESSMENT_STATUSES =
  new Set([
    "ASSESSMENT_NEEDED",
    "IN_ASSESSMENT"
  ]);

function clean(value) {
  return String(value ?? "").trim();
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assessmentStatusLabel(status) {
  const normalized =
    clean(status).toUpperCase();

  if (normalized === "ASSESSMENT_NEEDED") {
    return "Assessment Requested";
  }

  if (normalized === "IN_ASSESSMENT") {
    return "Assessment In Progress";
  }

  return normalized.replaceAll("_", " ");
}

function renderAssessmentNotice(pin) {
  const athleteUid =
    clean(pin?.athleteUid);

  const athleteName =
    clean(pin?.athleteName) ||
    athleteUid ||
    "Athlete";

  const discipline =
    clean(pin?.discipline) ||
    "Discipline not listed";

  const program =
    clean(pin?.program) ||
    "Program not listed";

  const status =
    assessmentStatusLabel(
      pin?.status
    );

  return `
    <article class="management-notice-card">
      <div class="management-notice-card__head">
        <div>
          <span class="notice-type">
            Athlete Assessment
          </span>

          <h3>
            ${esc(athleteName)}
          </h3>

          <p class="notice-meta">
            ${esc(athleteUid || "UID pending")}
            ·
            ${esc(discipline)}
            ·
            ${esc(program)}
          </p>
        </div>

        <span class="notice-state">
          ${esc(status)}
        </span>
      </div>

      <p class="notice-copy">
        Management sent this athlete for Coach experience and placement assessment.
        Open the assessment workflow to review FEAR, prior experience, placement,
        and return the findings to Management.
      </p>

      <div class="notice-actions">
        <a
          class="notice-action"
          href="/coaches/assessments/"
        >
          Open Assessment
        </a>
      </div>
    </article>
  `;
}

function setEmptyState(isEmpty) {
  const empty =
    $("managementNoticeEmpty");

  if (empty) {
    empty.hidden = !isEmpty;
  }
}

async function loadManagementNotices() {
  const count =
    $("managementNoticeCount");

  const status =
    $("managementNoticeStatus");

  const list =
    $("managementNoticeList");

  try {
    await requireCoach();

    const response =
      await listAssessmentPins();

    const pins =
      Array.isArray(response?.data?.pins)
        ? response.data.pins
        : Array.isArray(response?.data)
          ? response.data
          : [];

    const openAssessments =
      pins.filter((pin) =>
        OPEN_ASSESSMENT_STATUSES.has(
          clean(pin?.status).toUpperCase()
        )
      );

    if (count) {
      count.textContent =
        String(openAssessments.length);
    }

    if (list) {
      list.innerHTML =
        openAssessments
          .map(renderAssessmentNotice)
          .join("");
    }

    if (status) {
      status.textContent =
        openAssessments.length
          ? `${openAssessments.length} management request${openAssessments.length === 1 ? "" : "s"} waiting for Coach action.`
          : "";
    }

    setEmptyState(
      openAssessments.length === 0
    );
  } catch (error) {
    console.error(
      "[management-notice] load failed:",
      error
    );

    if (status) {
      status.textContent =
        "Management notices could not be loaded.";
    }

    if (count) {
      count.textContent = "0";
    }

    if (list) {
      list.replaceChildren();
    }

    setEmptyState(false);
  }
}

void loadManagementNotices();
