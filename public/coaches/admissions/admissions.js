import {
  db,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "/assets/js/firebase-init.js";

import {
  requireCoach,
} from "/assets/js/coach-guard.js";

const appointmentList =
  document.getElementById(
    "appointmentList"
  );

const appointmentStatus =
  document.getElementById(
    "appointmentStatus"
  );

const refreshAppointments =
  document.getElementById(
    "refreshAppointments"
  );

const assessmentWorkspace =
  document.getElementById(
    "assessmentWorkspace"
  );

const emptyWorkspace =
  document.getElementById(
    "emptyWorkspace"
  );

const athleteHeading =
  document.getElementById(
    "athleteHeading"
  );

const assessmentBadge =
  document.getElementById(
    "assessmentBadge"
  );

const appointmentWhen =
  document.getElementById(
    "appointmentWhen"
  );

const appointmentLocation =
  document.getElementById(
    "appointmentLocation"
  );

const programInterest =
  document.getElementById(
    "programInterest"
  );

const appointmentState =
  document.getElementById(
    "appointmentState"
  );

const reportedExperience =
  document.getElementById(
    "reportedExperience"
  );

const reportedExperienceNotes =
  document.getElementById(
    "reportedExperienceNotes"
  );

const assessmentForm =
  document.getElementById(
    "assessmentForm"
  );

const verifiedExperienceYears =
  document.getElementById(
    "verifiedExperienceYears"
  );

const coachAssessment =
  document.getElementById(
    "coachAssessment"
  );

const recommendedJourney =
  document.getElementById(
    "recommendedJourney"
  );

const recommendedDiscipline =
  document.getElementById(
    "recommendedDiscipline"
  );

const saveStatus =
  document.getElementById(
    "saveStatus"
  );

const completeAssessment =
  document.getElementById(
    "completeAssessment"
  );

let coachContext = null;
let appointments = [];
let selectedAppointment = null;

function clean(value) {
  return String(value ?? "").trim();
}

function athleteName(record) {
  return (
    clean(record.athleteName)
    || clean(record.athlete?.name)
    || [
      clean(record.athleteFirstName),
      clean(record.athleteLastName),
    ]
      .filter(Boolean)
      .join(" ")
    || [
      clean(record.athlete?.first),
      clean(record.athlete?.last),
    ]
      .filter(Boolean)
      .join(" ")
    || "Athlete"
  );
}

function labelExperienceRange(value) {
  switch (clean(value)) {
    case "under-1":
      return "Less than 1 year";

    case "1-2":
      return "1–2 years";

    case "2-3":
      return "2–3 years";

    case "3-plus":
      return "3+ years";

    default:
      return "";
  }
}

function reportedExperienceText(record) {
  const claim =
    clean(
      record.claimedPriorExperience
    ).toLowerCase();

  if (claim === "no") {
    return (
      "Family reported no previous training experience."
    );
  }

  if (claim === "yes") {
    const range =
      labelExperienceRange(
        record.claimedExperienceRange
      );

    return range
      ? `Family reported previous training experience: ${range}.`
      : "Family reported previous training experience.";
  }

  return "Prior experience was not reported.";
}

function formatTimestamp(value) {
  if (!value) {
    return "Not scheduled";
  }

  let date = null;

  if (
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else if (
    value instanceof Date
  ) {
    date = value;
  } else {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date) {
    return clean(value) || "Not scheduled";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
}

function appointmentDate(record) {
  return (
    record.appointmentDateTime
    || record.appointmentAt
    || record.scheduledAt
    || record.appointmentDate
    || ""
  );
}

function programLabel(record) {
  return (
    clean(record.programInterest)
    || clean(record.program)
    || clean(record.trainingInterest)
    || clean(record.disciplineInterest)
    || "Not specified"
  );
}

function setAssessmentBadge(record) {
  const completed =
    clean(
      record.assessmentStatus
    ).toLowerCase() === "completed";

  assessmentBadge.textContent =
    completed
      ? "Completed"
      : "Pending";
}

function renderAppointmentList() {
  appointmentList.innerHTML = "";

  if (!appointments.length) {
    appointmentStatus.textContent =
      "No assigned appointments.";

    const empty =
      document.createElement("p");

    empty.className = "muted";
    empty.textContent =
      "Management has not assigned any admissions appointments to you.";

    appointmentList.append(empty);

    return;
  }

  appointmentStatus.textContent =
    `${appointments.length} assigned appointment${
      appointments.length === 1
        ? ""
        : "s"
    }.`;

  for (const record of appointments) {
    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "appointment-item";

    if (
      selectedAppointment?.id ===
      record.id
    ) {
      button.classList.add(
        "is-selected"
      );
    }

    const name =
      document.createElement("span");

    name.className =
      "appointment-name";

    name.textContent =
      athleteName(record);

    const meta =
      document.createElement("span");

    meta.className =
      "appointment-meta";

    meta.textContent = [
      formatTimestamp(
        appointmentDate(record)
      ),
      clean(record.locationId),
      clean(record.assessmentStatus)
        .toLowerCase() === "completed"
        ? "Assessment completed"
        : "Assessment pending",
    ]
      .filter(Boolean)
      .join(" • ");

    button.append(
      name,
      meta
    );

    button.addEventListener(
      "click",
      () => {
        selectAppointment(record.id);
      }
    );

    appointmentList.append(button);
  }
}

function populateAssessment(record) {
  athleteHeading.textContent =
    athleteName(record);

  appointmentWhen.textContent =
    formatTimestamp(
      appointmentDate(record)
    );

  appointmentLocation.textContent =
    clean(record.locationId)
    || "Not specified";

  programInterest.textContent =
    programLabel(record);

  appointmentState.textContent =
    clean(record.appointmentStatus)
    || clean(record.status)
    || "Not specified";

  reportedExperience.textContent =
    reportedExperienceText(record);

  reportedExperienceNotes.textContent =
    clean(record.claimedExperienceNotes);

  verifiedExperienceYears.value =
    Number.isInteger(
      record.verifiedExperienceYears
    )
      ? String(
          record.verifiedExperienceYears
        )
      : "";

  coachAssessment.value =
    clean(record.coachAssessment);

  recommendedJourney.value =
    clean(
      record.coachRecommendation?.journey
    );

  recommendedDiscipline.value =
    clean(
      record.coachRecommendation
        ?.discipline
    );

  setAssessmentBadge(record);

  const completed =
    clean(record.assessmentStatus)
      .toLowerCase() === "completed";

  saveStatus.textContent =
    completed
      ? "Assessment previously completed. Submitting again will replace the Coach assessment fields."
      : "Assessment pending.";

  emptyWorkspace.hidden = true;
  assessmentWorkspace.hidden = false;
}

function selectAppointment(id) {
  const record =
    appointments.find(
      (item) => item.id === id
    );

  if (!record) {
    return;
  }

  selectedAppointment = record;

  renderAppointmentList();
  populateAssessment(record);
}

async function loadAppointments() {
  if (!coachContext?.uid) {
    appointmentStatus.textContent =
      "Coach access is required.";

    refreshAppointments.disabled = false;

    return;
  }

  appointmentStatus.textContent =
    "Loading assigned appointments…";

  refreshAppointments.disabled = true;

  try {
    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "admissions_appointments"
          ),
          where(
            "appointmentCoachUid",
            "==",
            coachContext.uid
          )
        )
      );

    appointments =
      snapshot.docs.map(
        (appointmentDoc) => ({
          id: appointmentDoc.id,
          ...appointmentDoc.data(),
        })
      );

    appointments.sort(
      (a, b) => {
        const aDate =
          appointmentDate(a);

        const bDate =
          appointmentDate(b);

        const aMillis =
          typeof aDate?.toMillis ===
          "function"
            ? aDate.toMillis()
            : new Date(aDate || 0)
                .getTime();

        const bMillis =
          typeof bDate?.toMillis ===
          "function"
            ? bDate.toMillis()
            : new Date(bDate || 0)
                .getTime();

        return aMillis - bMillis;
      }
    );

    if (selectedAppointment) {
      selectedAppointment =
        appointments.find(
          (record) =>
            record.id ===
            selectedAppointment.id
        ) || null;
    }

    renderAppointmentList();

    if (selectedAppointment) {
      populateAssessment(
        selectedAppointment
      );
    } else {
      assessmentWorkspace.hidden = true;
      emptyWorkspace.hidden = false;
    }
  } catch (error) {
    console.error(error);

    appointmentStatus.textContent =
      "Unable to load assigned appointments.";
  } finally {
    refreshAppointments.disabled = false;
  }
}

assessmentForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!selectedAppointment) {
      return;
    }

    const years =
      Number(
        verifiedExperienceYears.value
      );

    const assessment =
      clean(coachAssessment.value);

    const journey =
      clean(recommendedJourney.value);

    const discipline =
      clean(
        recommendedDiscipline.value
      );

    if (
      ![0, 1, 2, 3].includes(years)
      || !assessment
      || !journey
      || !discipline
    ) {
      saveStatus.textContent =
        "Complete all Coach verification fields.";

      return;
    }

    completeAssessment.disabled = true;

    saveStatus.textContent =
      "Saving authenticated Coach assessment…";

    try {
      await updateDoc(
        doc(
          db,
          "admissions_appointments",
          selectedAppointment.id
        ),
        {
          assessmentStatus:
            "completed",

          assessedByCoachUid:
            coachContext.uid,

          assessedByCoachName:
            clean(
              coachContext.staff?.displayName
            )
            || clean(
              coachContext.staff?.fullName
            )
            || clean(
              coachContext.staff?.name
            )
            || clean(
              coachContext.email
            )
            || "Coach",

          assessedAt:
            serverTimestamp(),

          verifiedExperienceYears:
            years,

          coachAssessment:
            assessment,

          coachRecommendation: {
            journey,
            discipline,
          },
        }
      );

      saveStatus.textContent =
        "Assessment completed and returned to Management.";

      await loadAppointments();

      if (selectedAppointment) {
        selectAppointment(
          selectedAppointment.id
        );
      }
    } catch (error) {
      console.error(error);

      saveStatus.textContent =
        "Assessment could not be saved.";
    } finally {
      completeAssessment.disabled = false;
    }
  }
);

refreshAppointments.addEventListener(
  "click",
  loadAppointments
);

async function boot() {
  try {
    coachContext =
      await requireCoach();

    await loadAppointments();
  } catch (error) {
    console.error(error);

    appointmentStatus.textContent =
      "Coach access is required.";
  }
}

boot();
