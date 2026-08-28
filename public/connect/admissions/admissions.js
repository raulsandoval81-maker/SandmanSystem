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

const followUpDate =
  document.getElementById("followUpDate");

const followUpField =
  document.getElementById("followUpField");

const coachVerificationStatus =
  document.getElementById(
    "coachVerificationStatus"
  );

const verifiedExperienceDisplay =
  document.getElementById(
    "verifiedExperienceDisplay"
  );

const assessedByCoachDisplay =
  document.getElementById(
    "assessedByCoachDisplay"
  );

const coachRecommendationDisplay =
  document.getElementById(
    "coachRecommendationDisplay"
  );

const coachAssessmentDisplay =
  document.getElementById(
    "coachAssessmentDisplay"
  );

const privateNotes =
  document.getElementById("privateNotes");

const saveDecisionBtn =
  document.getElementById("saveDecisionBtn");

const notEnrollingBtn =
  document.getElementById("notEnrollingBtn");

let appointmentRecord = null;
let admissionsDecisionSaved = false;

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

function recommendationFromProgram(
  programInterest = ""
) {
  const recommendations = {
    "zero2hero-wrestling": {
      journey: "zero2hero",
      discipline: "wrestling"
    },

    "zero2hero-muay-thai": {
      journey: "zero2hero",
      discipline: "muay-thai"
    },

    "zero2hero-boxing": {
      journey: "zero2hero",
      discipline: "boxing"
    },

    "path2legend-wrestling": {
      journey: "path2legend",
      discipline: "wrestling"
    },

    "path2legend-boxing": {
      journey: "path2legend",
      discipline: "boxing"
    },

    "path2legend-muay-thai": {
      journey: "path2legend",
      discipline: "muay-thai"
    },

    "quest2mastery-mma": {
      journey: "quest2mastery",
      discipline: "mma"
    },

    "quest2mastery-submission-grappling": {
      journey: "quest2mastery",
      discipline: "submission-grappling"
    },

    fitness: {
      journey: "everyday-fitness",
      discipline: "fitness"
    }
  };

  return recommendations[programInterest] || {
    journey: "",
    discipline: ""
  };
}

function disciplineOptionsForJourney(
  journey = ""
) {
  const options = {
    zero2hero: [
      ["wrestling", "Wrestling"],
      ["muay-thai", "Muay Thai"],
      ["boxing", "Boxing"]
    ],

    path2legend: [
      ["wrestling", "Wrestling"],
      ["boxing", "Boxing"],
      ["muay-thai", "Muay Thai"]
    ],

    quest2mastery: [
      ["mma", "MMA"],
      [
        "submission-grappling",
        "Submission Grappling"
      ]
    ],

    "everyday-fitness": [
      ["fitness", "Fitness"]
    ]
  };

  return options[journey] || [];
}

function populateDisciplineOptions(
  journey = "",
  selected = ""
) {
  if (!recommendedDiscipline) return;

  recommendedDiscipline.innerHTML =
    '<option value="">No recommendation yet</option>';

  for (
    const [value, label]
    of disciplineOptionsForJourney(journey)
  ) {
    const option =
      document.createElement("option");

    option.value = value;
    option.textContent = label;

    recommendedDiscipline.appendChild(option);
  }

  recommendedDiscipline.value =
    selected || "";
}

function updateFollowUpField() {
  if (!followUpField) return;

  const needsFollowUp =
    enrollmentDecision?.value === "follow-up";

  followUpField.hidden = !needsFollowUp;

  if (!needsFollowUp && followUpDate) {
    followUpDate.value = "";
  }
}

function labelForVerifiedExperience(
  years
) {
  if (years === 0) {
    return "No recognized prior experience";
  }

  if (years === 1) {
    return "1 year";
  }

  if (years === 2) {
    return "2 years";
  }

  if (years === 3) {
    return "3+ years";
  }

  return "Not verified";
}

function labelForCoachRecommendation(
  recommendation
) {
  if (
    !recommendation ||
    typeof recommendation !== "object"
  ) {
    return "No recommendation submitted";
  }

  const journey =
    String(
      recommendation.journey || ""
    ).trim();

  const discipline =
    String(
      recommendation.discipline || ""
    ).trim();

  if (!journey && !discipline) {
    return "No recommendation submitted";
  }

  return [
    journey,
    discipline
  ]
    .filter(Boolean)
    .join(" • ");
}

function renderCoachVerification(record) {
  const completed =
    record.assessmentStatus === "completed";

  if (coachVerificationStatus) {
    coachVerificationStatus.textContent =
      completed
        ? "Completed Coach assessment"
        : "No completed Coach assessment.";
  }

  if (verifiedExperienceDisplay) {
    verifiedExperienceDisplay.textContent =
      completed
        ? labelForVerifiedExperience(
            record.verifiedExperienceYears
          )
        : "Pending Coach verification";
  }

  if (assessedByCoachDisplay) {
    assessedByCoachDisplay.textContent =
      completed
        ? (
            record.assessedByCoachName ||
            "Authenticated Coach"
          )
        : "—";
  }

  if (coachRecommendationDisplay) {
    coachRecommendationDisplay.textContent =
      completed
        ? labelForCoachRecommendation(
            record.coachRecommendation
          )
        : "—";
  }

  if (coachAssessmentDisplay) {
    coachAssessmentDisplay.textContent =
      completed
        ? (
            record.coachAssessment ||
            "No technical notes submitted."
          )
        : "No Coach assessment has been submitted.";
  }
}

function fillDecisionForm(record) {
  const incoming =
    recommendationFromProgram(
      record.programInterest || ""
    );

  appointmentOutcome.value =
    record.appointmentOutcome || "";

  enrollmentDecision.value =
    record.enrollmentDecision || "";

  const journey =
    record.recommendedJourney ||
    incoming.journey ||
    "";

  const discipline =
    record.recommendedDiscipline ||
    incoming.discipline ||
    "";

  recommendedJourney.value = journey;

  populateDisciplineOptions(
    journey,
    discipline
  );

  renderCoachVerification(record);

  followUpDate.value =
    record.followUpDate || "";

  privateNotes.value =
    record.privateAdmissionsNotes || "";

  admissionsDecisionSaved =
    Boolean(
      record.admissionsDecisionAt ||
      record.appointmentOutcome
    );

  decisionPanel.hidden = false;

  updateFollowUpField();
  updateActionLinks();
}

function updateActionLinks() {
  const outcome =
    appointmentOutcome?.value || "";

  const decision =
    enrollmentDecision?.value || "";

  const builderAllowed =
    admissionsDecisionSaved &&
    outcome === "completed" &&
    (
      decision === "ready-to-enroll" ||
      decision === "follow-up" ||
      decision === "undecided"
    );

  if (openProposalBtn) {
    if (builderAllowed) {
      openProposalBtn.href =
        "/connect/admissions/calculator/" +
        `?appointmentId=${encodeURIComponent(
          appointmentId
        )}`;

      openProposalBtn.removeAttribute(
        "aria-disabled"
      );

      openProposalBtn.classList.remove(
        "is-disabled"
      );
    } else {
      openProposalBtn.href = "#";

      openProposalBtn.setAttribute(
        "aria-disabled",
        "true"
      );

      openProposalBtn.classList.add(
        "is-disabled"
      );
    }
  }

  if (notEnrollingBtn) {
    notEnrollingBtn.hidden =
      !(
        admissionsDecisionSaved &&
        outcome === "completed" &&
        decision === "not-enrolling"
      );
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
        recommendedDiscipline.value || "",

      followUpDate:
        followUpDate.value || "",

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

    admissionsDecisionSaved = true;

    renderSummary(appointmentRecord);
    updateFollowUpField();
    updateActionLinks();

    const builderReady =
      outcome === "completed" &&
      (
        decision === "ready-to-enroll" ||
        decision === "follow-up" ||
        decision === "undecided"
      );

    setStatus(
      builderReady
        ? "Admissions decision saved. Ready for Prospect Builder."
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
  () => {
    admissionsDecisionSaved = false;
    updateFollowUpField();
    updateActionLinks();
  }
);

appointmentOutcome?.addEventListener(
  "change",
  () => {
    admissionsDecisionSaved = false;
    updateActionLinks();
  }
);

recommendedJourney?.addEventListener(
  "change",
  () => {
    admissionsDecisionSaved = false;

    populateDisciplineOptions(
      recommendedJourney.value,
      ""
    );

    updateActionLinks();
  }
);

recommendedDiscipline?.addEventListener(
  "change",
  () => {
    admissionsDecisionSaved = false;
    updateActionLinks();
  }
);

openProposalBtn?.addEventListener(
  "click",
  (event) => {
    if (
      openProposalBtn.getAttribute(
        "aria-disabled"
      ) === "true"
    ) {
      event.preventDefault();

      setStatus(
        "Save a completed Admissions Decision before opening Prospect Builder.",
        "error"
      );
    }
  }
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