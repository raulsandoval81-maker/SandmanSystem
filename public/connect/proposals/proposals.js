import {
  auth,
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

const params =
  new URLSearchParams(window.location.search);

const appointmentId =
  params.get("appointmentId") || "";

const appointmentContext =
  document.getElementById(
    "appointmentContext"
  );

const appointmentContextStatus =
  document.getElementById(
    "appointmentContextStatus"
  );

const appointmentContextDetails =
  document.getElementById(
    "appointmentContextDetails"
  );

const openProspectBuilderBtn =
  document.getElementById(
    "openProspectBuilderBtn"
  );
  
function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(value) {
  return value === undefined ||
    value === null ||
    value === ""
    ? "—"
    : value;
}

function labelForLocation(value = "") {
  const labels = {
    lompoc:
      "Lompoc",

    solvang:
      "Solvang",

    either:
      "Either Location"
  };

  return labels[value] || value || "—";
}

function labelForProgram(value = "") {
  const labels = {
    "zero2hero-wrestling":
      "Zero2Hero Wrestling",

    "zero2hero-boxing":
      "Zero2Hero Boxing",

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

function labelForJourney(value = "") {
  const labels = {
    zero2hero:
      "Zero2Hero",

    path2legend:
      "Path2Legend",

    quest2mastery:
      "Quest2Mastery",

    "everyday-fitness":
      "Everyday Fitness"
  };

  return labels[value] || value || "—";
}

function labelForPrimaryGoal(value = "") {
  const labels = {
    confidence:
      "Build Confidence",

    "self-defense":
      "Learn Self-Defense",

    selfdefense:
      "Learn Self-Defense",

    competition:
      "Competition",

    fitness:
      "Fitness & Health",

    character:
      "Character & Discipline",

    discipline:
      "Character & Discipline",

    exploring:
      "Just Exploring",

    health:
      "Health",

    "weight-loss":
      "Weight Loss",

    weightloss:
      "Weight Loss"
  };

  return labels[value] || value || "—";
}

function labelForStartingPath(value = "") {
  const labels = {
    new:
      "New Athlete",

    assessment:
      "Placement Assessment"
  };

  return labels[value] || value || "—";
}

function formatDate(value = "") {
  if (!value) {
    return "—";
  }

  const date =
    new Date(`${value}T12:00:00`);

  return Number.isFinite(
    date.getTime()
  )
    ? date.toLocaleDateString()
    : value;
}

function buildTalkingPoints(appointment) {
  const athleteName =
    appointment.athleteName ||
    appointment.participantName ||
    "the athlete";

  const primaryGoal =
    labelForPrimaryGoal(
      appointment.primaryGoal
    );

  const programInterest =
    labelForProgram(
      appointment.programInterest
    );

  const recommendedJourney =
    labelForJourney(
      appointment.recommendedJourney
    );

  const recommendedDiscipline =
    appointment.recommendedDiscipline ||
    "No discipline selected yet";

  const startingPath =
    labelForStartingPath(
      appointment.recommendedStartingPath ||
      appointment.admissionsPath
    );


  const coachAssessment =
    appointment.coachAssessment ||
    "No coach assessment has been recorded yet.";

  const nextStep =
    appointment.enrollmentDecision ===
    "ready-to-enroll"
      ? "Work through program and billing options, select the best fit, and finalize the proposal."
      : appointment.enrollmentDecision ===
        "follow-up"
        ? "Prepare options for follow-up and address the family's remaining questions."
        : appointment.enrollmentDecision ===
          "undecided"
          ? "Clarify concerns and compare the most suitable program and billing options."
          : "Review the appointment outcome before advancing the proposal.";

  return `
    <div>
      <h3>
        Meeting Talking Points
      </h3>

      <p>
        <strong>Why they came in:</strong>
        ${esc(
          primaryGoal !== "—"
            ? primaryGoal
            : programInterest
        )}
      </p>

      <p>
        <strong>Current interest:</strong>
        ${esc(programInterest)}
      </p>

      <p>
        <strong>Coach recommendation:</strong>
        ${esc(recommendedJourney)}
        ·
        ${esc(recommendedDiscipline)}
      </p>

      <p>
        <strong>Starting path:</strong>
        ${esc(startingPath)}
      </p>

      <p>
        <strong>Coach observation:</strong>
        ${esc(coachAssessment)}
      </p>

      <p>
        <strong>Conversation focus:</strong>
        Help ${esc(athleteName)} and the family compare
        the available options and identify the best fit.
      </p>

      <p>
        <strong>Recommended next step:</strong>
        ${esc(nextStep)}
      </p>
    </div>
  `;
}

async function requireStaffUser() {
  if (
    typeof auth.authStateReady ===
    "function"
  ) {
    await auth.authStateReady();
  }

  const user =
    auth.currentUser;

  if (!user) {
    const returnUrl =
      window.location.pathname +
      window.location.search;

    window.location.replace(
      "/management/auth/?returnUrl=" +
      encodeURIComponent(returnUrl)
    );

    return null;
  }

  return user;
}

async function loadAppointmentContext() {
  if (!appointmentId) {
    if (appointmentContextStatus) {
      appointmentContextStatus.textContent =
        "No appointment was handed into this proposal.";
    }

    if (appointmentContext) {
      appointmentContext.hidden = false;
    }

    return;
  }

  if (openProspectBuilderBtn) {
    openProspectBuilderBtn.href =
      "/connect/admissions/calculator/" +
      `?appointmentId=${encodeURIComponent(
        appointmentId
      )}`;
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
      "The appointment handoff could not be found."
    );
  }

  const appointment = {
    id:
      snapshot.id,

    ...snapshot.data()
  };

  const athleteName =
    appointment.athleteName ||
    appointment.participantName ||
    "—";

  const parentName =
    appointment.registrantRole ===
    "adult-athlete"
      ? "Adult athlete"
      : appointment.parentName ||
        "—";

  const programInterest =
    labelForProgram(
      appointment.programInterest
    );

  const recommendedJourney =
    labelForJourney(
      appointment.recommendedJourney
    );

  const recommendedDiscipline =
    displayValue(
      appointment.recommendedDiscipline
    );

  const startingPath =
    labelForStartingPath(
      appointment.recommendedStartingPath ||
      appointment.admissionsPath
    );

  const primaryGoal =
    labelForPrimaryGoal(
      appointment.primaryGoal
    );

  const appointmentLocation =
    labelForLocation(
      appointment.appointmentLocation ||
      appointment.preferredLocation
    );

  const coachName =
    displayValue(
      appointment.appointmentCoach
    );

  const appointmentDate =
    formatDate(
      appointment.appointmentDate
    );

  const coachAssessment =
    displayValue(
      appointment.coachAssessment
    );

  const appointmentNotes =
    displayValue(
      appointment.appointmentNotes
    );

  const leadNotes =
    displayValue(
      appointment.leadNotes
    );

  const hasPrivateNotes =
    Boolean(
      String(
        appointment.privateAdmissionsNotes ||
        ""
      ).trim()
    );

  if (appointmentContextDetails) {
    appointmentContextDetails.innerHTML = `
      <div>
        <h3>
          Family and Athlete
        </h3>

        <p>
          <strong>Athlete:</strong>
          ${esc(athleteName)}
        </p>

        <p>
          <strong>Parent / Guardian:</strong>
          ${esc(parentName)}
        </p>

        <p>
          <strong>Age:</strong>
          ${esc(
            displayValue(
              appointment.athleteAge
            )
          )}
        </p>

        <p>
          <strong>Phone:</strong>
          ${esc(
            displayValue(
              appointment.phone
            )
          )}
        </p>

        <p>
          <strong>Email:</strong>
          ${esc(
            displayValue(
              appointment.email
            )
          )}
        </p>

        <p>
          <strong>Academy Shirt Size:</strong>
          ${esc(
            displayValue(
              appointment.shirtSize
            )
          )}
        </p>
      </div>

      <div>
        <h3>
          Appointment Context
        </h3>

        <p>
          <strong>Program Interest:</strong>
          ${esc(programInterest)}
        </p>

        <p>
          <strong>Primary Goal:</strong>
          ${esc(primaryGoal)}
        </p>

        <p>
          <strong>Starting Path:</strong>
          ${esc(startingPath)}
        </p>

        <p>
          <strong>Academy:</strong>
          ${esc(appointmentLocation)}
        </p>

        <p>
          <strong>Appointment Date:</strong>
          ${esc(appointmentDate)}
        </p>

        <p>
          <strong>Coach:</strong>
          ${esc(coachName)}
        </p>
      </div>

      <div>
        <h3>
          Coach Recommendation
        </h3>

        <p>
          <strong>Recommended Journey:</strong>
          ${esc(recommendedJourney)}
        </p>

        <p>
          <strong>Recommended Discipline:</strong>
          ${esc(recommendedDiscipline)}
        </p>

        <p>
          <strong>Coach Assessment:</strong>
          ${esc(coachAssessment)}
        </p>

        <p>
          <strong>Appointment Notes:</strong>
          ${esc(appointmentNotes)}
        </p>

        <p>
          <strong>Original Family Notes:</strong>
          ${esc(leadNotes)}
        </p>

        <p>
          <strong>Private Admissions Notes:</strong>
          ${
            hasPrivateNotes
              ? "Available to authorized staff"
              : "None recorded"
          }
        </p>
      </div>

      ${buildTalkingPoints(appointment)}
    `;
  }

  if (appointmentContextStatus) {
    appointmentContextStatus.textContent =
      `Appointment handoff loaded: ${appointment.id}`;
  }

  if (appointmentContext) {
    appointmentContext.hidden = false;
  }
}


try {
  const user =
    await requireStaffUser();

  if (user) {
    await loadAppointmentContext();
  }
} catch (error) {
  console.error(
    "[proposals] appointment handoff failed:",
    error
  );

  if (appointmentContextStatus) {
    appointmentContextStatus.textContent =
      error?.message ||
      "Unable to load appointment context.";
  }

  if (appointmentContext) {
    appointmentContext.hidden = false;
  }
}