import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const params =
  new URLSearchParams(window.location.search);

const appointmentId =
  params.get("appointmentId") ||
  params.get("leadId") ||
  "";

const appointmentSummary =
  document.getElementById("appointmentSummary");

const decisionPanel =
  document.getElementById("decisionPanel");

const openProposalBtn =
  document.getElementById("openProposalBtn");

const pageStatus =
  document.getElementById("pageStatus");

const refreshBtn =
  document.getElementById("refreshBtn");

const admissionsForm =
  document.getElementById("admissionsForm");

const appointmentOutcome =
  document.getElementById("appointmentOutcome");

const enrollmentDecision =
  document.getElementById("enrollmentDecision");

const recommendedJourney =
  document.getElementById("recommendedJourney");

const recommendedDiscipline =
  document.getElementById("recommendedDiscipline");

const recommendedStartingPath =
  document.getElementById("recommendedStartingPath");

const followUpDate =
  document.getElementById("followUpDate");

const coachAssessment =
  document.getElementById("coachAssessment");

const privateNotes =
  document.getElementById("privateNotes");

const saveDecisionBtn =
  document.getElementById("saveDecisionBtn");

const continueToEnrollmentBtn =
  document.getElementById(
    "continueToEnrollmentBtn"
  );

const notEnrollingBtn =
  document.getElementById("notEnrollingBtn");

let appointmentRecord = null;

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message = "", type = "") {
  if (!pageStatus) return;

  pageStatus.textContent = message;
  pageStatus.className = "page-status";

  if (type) {
    pageStatus.classList.add(type);
  }
}

function formatDate(value = "") {
  if (!value) return "—";

  const date =
    new Date(`${value}T12:00:00`);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : value;
}

function formatTime(value = "") {
  if (!value) return "—";

  const [hourRaw, minuteRaw] =
    value.split(":");

  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return value;
  }

  return new Date(
    2000,
    0,
    1,
    hour,
    minute
  ).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function labelForLocation(value = "") {
  const labels = {
    lompoc: "Lompoc",
    solvang: "Solvang",
    either: "Either Location"
  };

  return labels[value] || value || "—";
}

function labelForProgram(value = "") {
  const labels = {
    "zero2hero-wrestling":
      "Zero2Hero Wrestling",

    "zero2hero-muay-thai":
      "Zero2Hero Muay Thai",

    "path2legend-wrestling":
      "Path2Legend Wrestling",

    "path2legend-boxing":
      "Path2Legend Boxing",

    "path2legend-muay-thai":
      "Path2Legend Muay Thai",

    "quest2mastery-mma":
      "Quest2Mastery MMA",

    "quest2mastery-submission-grappling":
      "Quest2Mastery Submission Grappling",

    fitness:
      "Everyday Fitness"
  };

  return labels[value] || value || "—";
}

function labelForOutcome(value = "") {
  const labels = {
    completed: "Completed",
    "no-show": "No-Show",
    cancelled: "Cancelled",
    rescheduled: "Rescheduled"
  };

  return labels[value] || "Pending Decision";
}

async function requireAdminUser() {
  if (
    typeof auth.authStateReady === "function"
  ) {
    await auth.authStateReady();
  }

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Firebase staff session required."
    );
  }

  await user.getIdTokenResult(true);

  return user;
}

function renderSummary(record) {
  if (!appointmentSummary) return;

  appointmentSummary.innerHTML = `
    <header class="summary-head">
      <div>
        <h2>
          ${esc(
            record.participantName ||
            record.athleteName ||
            "Unnamed Participant"
          )}
        </h2>

        <div class="summary-sub">
          ${
            record.registrantRole ===
            "adult-athlete"
              ? "Adult Athlete"
              : `Parent or Guardian: ${
                  esc(record.parentName || "—")
                }`
          }
        </div>
      </div>

      <span class="status-badge">
        ${esc(
          labelForOutcome(
            record.appointmentOutcome
          )
        )}
      </span>
    </header>

    <div class="summary-grid">

      <div class="summary-item">
        <span class="field-label">Date</span>
        <div class="field-value">
          ${esc(
            formatDate(
              record.appointmentDate
            )
          )}
        </div>
      </div>

      <div class="summary-item">
        <span class="field-label">Time</span>
        <div class="field-value">
          ${esc(
            formatTime(
              record.appointmentTime
            )
          )}
        </div>
      </div>

      <div class="summary-item">
        <span class="field-label">
          Academy
        </span>

        <div class="field-value">
          ${esc(
            labelForLocation(
              record.appointmentLocation
            )
          )}
        </div>
      </div>

      <div class="summary-item">
        <span class="field-label">Coach</span>
        <div class="field-value">
          ${esc(
            record.appointmentCoach || "—"
          )}
        </div>
      </div>

      <div class="summary-item">
        <span class="field-label">
          Journey
        </span>

        <div class="field-value">
          ${esc(
            labelForProgram(
              record.programInterest
            )
          )}
        </div>
      </div>

      <div class="summary-item">
        <span class="field-label">
          Confirmation
        </span>

        <div class="field-value">
          ${esc(
            record.appointmentConfirmationStatus ||
            "pending"
          )}
        </div>
      </div>

    </div>
  `;

  appointmentSummary.hidden = false;
}

function fillDecisionForm(record) {
  appointmentOutcome.value =
    record.appointmentOutcome || "";

  enrollmentDecision.value =
    record.enrollmentDecision || "";

  recommendedJourney.value =
    record.recommendedJourney || "";

  recommendedDiscipline.value =
    record.recommendedDiscipline || "";

  recommendedStartingPath.value =
    record.recommendedStartingPath || "";

  followUpDate.value =
    record.followUpDate || "";

  coachAssessment.value =
    record.coachAssessment || "";

  privateNotes.value =
    record.privateAdmissionsNotes || "";

  decisionPanel.hidden = false;

  updateActionLinks();
}

function updateActionLinks() {
  const decision =
    enrollmentDecision?.value || "";

  const enrollmentUrl =
    "/connect/enrollment/" +
    `?appointmentId=${encodeURIComponent(
      appointmentId
    )}`;

if (openProposalBtn) {
  openProposalBtn.href =
    "/connect/admissions/calculator/" +
    `?appointmentId=${encodeURIComponent(
      appointmentId
    )}`;
}

  if (continueToEnrollmentBtn) {
    continueToEnrollmentBtn.href =
      enrollmentUrl;

    continueToEnrollmentBtn.hidden =
      decision !== "ready-to-enroll";
  }

  if (notEnrollingBtn) {
    notEnrollingBtn.hidden =
      decision !== "not-enrolling";
  }
}

async function loadAppointment() {
  if (!appointmentId) {
    throw new Error(
      "Open Admissions from an appointment record."
    );
  }

  const snapshot =
    await getDoc(
      doc(
        db,
        "admissions_appointments",
        appointmentId
      )
    );

  if (!snapshot.exists()) {
    throw new Error(
      "Admissions appointment was not found."
    );
  }

  appointmentRecord = {
    id: snapshot.id,
    ...snapshot.data()
  };

  renderSummary(appointmentRecord);
  fillDecisionForm(appointmentRecord);

  setStatus(
    "Admissions appointment loaded."
  );
}

async function saveAdmissionsDecision() {
  const outcome =
    String(
      appointmentOutcome?.value || ""
    ).trim();

  const decision =
    String(
      enrollmentDecision?.value || ""
    ).trim();

  if (!outcome || !decision) {
    setStatus(
      "Select the appointment outcome and enrollment decision.",
      "error"
    );

    return;
  }

  if (
    decision === "follow-up" &&
    !followUpDate.value
  ) {
    setStatus(
      "Choose a follow-up date.",
      "error"
    );

    return;
  }

  saveDecisionBtn.disabled = true;
  saveDecisionBtn.textContent =
    "Saving Decision...";

  try {
    await requireAdminUser();

    const appointmentRef =
      doc(
        db,
        "admissions_appointments",
        appointmentId
      );

    const admissionsStatus =
      decision === "ready-to-enroll"
        ? "ready_to_enroll"
        : decision === "not-enrolling"
          ? "closed_not_enrolled"
          : decision === "follow-up"
            ? "follow_up"
            : "undecided";

    const appointmentStatus =
      outcome === "completed"
        ? "completed"
        : outcome;

    const decisionData = {
      appointmentOutcome: outcome,
      appointmentStatus,
      status: appointmentStatus,

      enrollmentDecision: decision,
      admissionsStatus,

      recommendedJourney:
        recommendedJourney.value || "",

      recommendedDiscipline:
        recommendedDiscipline.value.trim(),

      recommendedStartingPath:
        recommendedStartingPath.value || "",

      followUpDate:
        followUpDate.value || "",

      coachAssessment:
        coachAssessment.value.trim(),

      privateAdmissionsNotes:
        privateNotes.value.trim(),

      admissionsDecisionAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    };

    await setDoc(
      appointmentRef,
      decisionData,
      {
        merge: true
      }
    );

    if (appointmentRecord?.leadId) {
      await updateDoc(
        doc(
          db,
          "interest_leads",
          appointmentRecord.leadId
        ),
        {
          admissionsStatus,
          enrollmentDecision: decision,
          appointmentOutcome: outcome,
          updatedAt: serverTimestamp()
        }
      );
    }

    appointmentRecord = {
      ...appointmentRecord,
      ...decisionData
    };

    renderSummary(appointmentRecord);
    updateActionLinks();

    setStatus(
      decision === "ready-to-enroll"
        ? "Admissions decision saved. Ready to continue to enrollment."
        : "Admissions decision saved.",
      "success"
    );
  } catch (error) {
    console.error(
      "[admissions] save failed:",
      error
    );

    setStatus(
      error?.message ||
      "Unable to save the admissions decision.",
      "error"
    );
  } finally {
    saveDecisionBtn.disabled = false;
    saveDecisionBtn.textContent =
      "Save Admissions Decision";
  }
}

admissionsForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    await saveAdmissionsDecision();
  }
);

enrollmentDecision?.addEventListener(
  "change",
  updateActionLinks
);

refreshBtn?.addEventListener(
  "click",
  async () => {
    setStatus("Refreshing...");

    try {
      await requireAdminUser();
      await loadAppointment();
    } catch (error) {
      setStatus(
        error?.message ||
        "Unable to refresh admissions.",
        "error"
      );
    }
  }
);

try {
  await requireAdminUser();
  await loadAppointment();
} catch (error) {
  console.error(
    "[admissions] boot failed:",
    error
  );

  setStatus(
    error?.message ||
    "Unable to open admissions.",
    "error"
  );
}