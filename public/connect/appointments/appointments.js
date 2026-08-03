import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const appointmentList =
  document.getElementById("appointmentList");

const pageStatus =
  document.getElementById("pageStatus");

const refreshBtn =
  document.getElementById("refreshBtn");

const schedulePanel =
  document.getElementById("schedulePanel");

const selectedLeadSummary =
  document.getElementById("selectedLeadSummary");

const scheduleForm =
  document.getElementById("scheduleForm");

const appointmentDate =
  document.getElementById("appointmentDate");

const appointmentTime =
  document.getElementById("appointmentTime");

const appointmentLocation =
  document.getElementById("appointmentLocation");

const appointmentCoach =
  document.getElementById("appointmentCoach");

const appointmentNotes =
  document.getElementById("appointmentNotes");

const scheduleBtn =
  document.getElementById("scheduleBtn");

const params = new URLSearchParams(window.location.search);
const selectedLeadId = params.get("leadId") || "";

let selectedLead = null;

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message = "", isError = false) {
  if (!pageStatus) return;

  pageStatus.textContent = message;
  pageStatus.className = "page-status";

  if (isError) {
    pageStatus.classList.add("error");
  }
}

function labelForProgram(program = "") {
  const labels = {
    "zero2hero-wrestling": "Zero2Hero Wrestling",
    "z2h-wrestling": "Zero2Hero Wrestling",

    "zero2hero-kickboxing": "Zero2Hero Kickboxing",
    "z2h-kickboxing": "Zero2Hero Kickboxing",

    "path2legend-wrestling": "Path2Legend Wrestling",
    "p2l-wrestling": "Path2Legend Wrestling",

    "path2legend-boxing": "Path2Legend Boxing",
    "p2l-boxing": "Path2Legend Boxing",

    fitness: "Everyday Fitness",
    "learning-more": "Just Learning More"
  };
  return labels[program] || program || "—";
}

function labelForIntent(intent = "") {
  const labels = {
    "academy-introduction": "Admissions Appointment",
    trial: "2-Day Trial",
    membership: "Monthly Membership",
    unlimited: "Unlimited Athlete Membership",
    "family-wellness": "Family Wellness Membership",
    general: "General Interest"
  };

  return labels[intent] || intent || "General Interest";
}

function labelForLocation(location = "") {
  const labels = {
    lompoc: "Lompoc",
    solvang: "Solvang",
    either: "Either Location"
  };

  return labels[location] || location || "—";
}


function labelForAdmissionsPath(value = "") {
  const labels = {
    new: "New Athlete",
    assessment: "Placement Assessment"
  };

  return labels[value] || "—";
}
function formatAppointmentDate(dateValue = "") {
  if (!dateValue) return "—";

  const date = new Date(`${dateValue}T12:00:00`);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : dateValue;
}

function formatAppointmentTime(timeValue = "") {
  if (!timeValue) return "—";

  const [hourRaw, minuteRaw] = timeValue.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return timeValue;
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

function labelForConfirmationStatus(value = "") {
  const labels = {
    pending: "Confirmation Pending",
    sent: "Confirmation Sent",
    confirmed: "Confirmed",
    declined: "Declined",
    cancelled: "Cancelled"
  };

  return labels[value] || "Confirmation Pending";
}

function labelForMeetingWindow(value = "") {
  const labels = {
    "weekday-afternoon":
      "Weekday Afternoon (2:00 PM – 6:00 PM)",

    "weekday-evening":
      "Weekday Evening (5:00 PM – 9:00 PM)",

    "saturday-morning":
      "Saturday Morning (8:00 AM – 12:00 PM)",

    "saturday-afternoon":
      "Saturday Afternoon (12:00 PM – 4:00 PM)",

    flexible:
      "Flexible"
  };

  return labels[value] || value || "—";
}
function labelForPrimaryGoal(value = "") {
  const labels = {
    fitness: "Fitness",
    competition: "Competition",
    confidence: "Confidence",
    selfdefense: "Self-Defense",
    "self-defense": "Self-Defense",
    discipline: "Discipline",
    fun: "Fun",
    health: "Health",
    weightloss: "Weight Loss",
    "weight-loss": "Weight Loss"
  };

  return labels[value] || value || "—";
}

async function requireAdminUser() {
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }

  const user = auth.currentUser;

  if (!user) {
    throw new Error("Firebase user session required.");
  }

  await user.getIdTokenResult(true);

  return user;
}

async function loadSelectedLead() {
  if (!selectedLeadId) return;

  const leadSnapshot =
    await getDoc(
      doc(db, "interest_leads", selectedLeadId)
    );

  if (!leadSnapshot.exists()) {
    throw new Error("Selected lead was not found.");
  }

  selectedLead = {
    id: leadSnapshot.id,
    ...leadSnapshot.data()
  };

  if (selectedLeadSummary) {
selectedLeadSummary.innerHTML = `
<div class="appointment-card">

  <h4>Athlete Information</h4>

  <p>
    <strong>Athlete:</strong>
    ${esc(selectedLead.athleteName || "—")}
  </p>

  <p>
    <strong>Parent / Guardian:</strong>
    ${esc(selectedLead.parentName || "—")}
  </p>

  <p>
    <strong>Age:</strong>
    ${esc(selectedLead.athleteAge || "—")}
  </p>

  <p>
    <strong>Academy Shirt Size:</strong>
    ${esc(selectedLead.shirtSize || "—")}
  </p>

    <p>
      <strong>Phone:</strong>
      ${esc(selectedLead.phone || "—")}
    </p>

    <p>
      <strong>Email:</strong>
      ${esc(selectedLead.email || "—")}
    </p>

    <p>
      <strong>City:</strong>
      ${esc(selectedLead.city || "—")}
    </p>

    <hr>

    <h4>Program & Enrollment</h4>

    <p>
      <strong>Journey:</strong>
      ${esc(labelForProgram(selectedLead.programInterest))}
    </p>

    <p>
      <strong>Membership Interest:</strong>
      ${esc(labelForIntent(selectedLead.intent))}
    </p>

<p>
  <strong>Primary Goal:</strong>
  ${esc(labelForPrimaryGoal(selectedLead.primaryGoal))}
</p>

<p>
<strong>Starting Path:</strong>
${esc(labelForAdmissionsPath(selectedLead.admissionsPath))}
</p>
    <hr>

    <h4>Family Preferences</h4>

    <p>
      <strong>Preferred Academy:</strong>
      ${esc(labelForLocation(selectedLead.preferredLocation))}
    </p>

    <p>
      <strong>Preferred Meeting Window:</strong>
      ${esc(labelForMeetingWindow(selectedLead.preferredMeetingWindow))}
    </p>

    <p>
      <strong>Referral Source:</strong>
      ${esc(selectedLead.referralSource || "—")}
    </p>


    ${
      selectedLead.notes
        ? `
          <hr>

          <h4>Parent Notes</h4>

          <p>
            ${esc(selectedLead.notes)}
          </p>
        `
        : ""
    }

  </div>
`;

  }

  if (appointmentLocation) {
    const preferred =
      selectedLead.preferredLocation || "";

    appointmentLocation.value =
      preferred === "lompoc" || preferred === "solvang"
        ? preferred
        : "";
  }

  appointmentDate.value =
  selectedLead.appointmentDate || "";

appointmentTime.value =
  selectedLead.appointmentTime || "";

appointmentLocation.value =
  selectedLead.appointmentLocation ||
  selectedLead.preferredLocation ||
  "";

appointmentCoach.value =
  selectedLead.appointmentCoach ||
  "Coach Sandoval";

appointmentNotes.value =
  selectedLead.appointmentNotes || "";

  if (schedulePanel) {
    schedulePanel.hidden = false;
  }
}

async function migrateLegacyAppointments() {
  const legacySnapshot =
    await getDocs(
      collection(db, "interest_leads")
    );

  const legacyAppointments =
    legacySnapshot.docs
      .map((leadDoc) => ({
        id: leadDoc.id,
        ...leadDoc.data()
      }))
      .filter((lead) => {
        const appointmentStatus =
          lead.appointmentStatus ||
          lead.appointment?.status ||
          "";

        return (
          appointmentStatus === "scheduled" ||
          lead.status === "appointment_scheduled"
        );
      });

  let migratedCount = 0;

  for (const lead of legacyAppointments) {
    const appointmentRef =
      doc(
        db,
        "admissions_appointments",
        lead.id
      );

    const existingAppointment =
      await getDoc(appointmentRef);

    if (existingAppointment.exists()) {
      continue;
    }

    await setDoc(
      appointmentRef,
      {
        appointmentId: lead.id,
        leadId: lead.id,

        participantName:
          lead.athleteName || "",

        athleteName:
          lead.athleteName || "",

        parentName:
          lead.parentName || "",

        registrantRole:
          lead.registrantRole || "",

        athleteAge:
          lead.athleteAge || "",

        email:
          lead.email || "",

        phone:
          lead.phone || "",

        city:
          lead.city || "",

        shirtSize:
          lead.shirtSize || "",

        programInterest:
          lead.programInterest || "",

        intent:
          lead.intent || "",

        primaryGoal:
          lead.primaryGoal || "",

        admissionsPath:
          lead.admissionsPath || "new",

        preferredLocation:
          lead.preferredLocation || "",

        preferredMeetingWindow:
          lead.preferredMeetingWindow || "",

        referralSource:
          lead.referralSource || "",

        leadNotes:
          lead.notes || "",

        appointmentDate:
          lead.appointmentDate ||
          lead.appointment?.date ||
          "",

        appointmentTime:
          lead.appointmentTime ||
          lead.appointment?.time ||
          "",

        appointmentLocation:
          lead.appointmentLocation ||
          lead.appointment?.location ||
          "",

        appointmentCoach:
          lead.appointmentCoach ||
          lead.appointment?.coachName ||
          "",

        appointmentNotes:
          lead.appointmentNotes ||
          lead.appointment?.notes ||
          "",

        appointmentStatus:
          lead.appointmentStatus ||
          lead.appointment?.status ||
          "scheduled",

        status:
          lead.appointmentStatus ||
          lead.appointment?.status ||
          "scheduled",

        appointmentConfirmationStatus:
          lead.appointmentConfirmationStatus ||
          "pending",

        enrollmentStatus:
          lead.enrollmentStatus ||
          "not_started",

        athleteStatus:
          lead.athleteStatus ||
          "none",

        migratedFromLegacyLead: true,
        migratedAt: serverTimestamp(),

        createdAt:
          lead.appointmentScheduledAt ||
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );

    migratedCount += 1;
  }

  return migratedCount;
}

async function loadAppointments() {
  if (!appointmentList) return;

  setStatus("Loading appointments...");

  try {
    await requireAdminUser();

    const migratedCount =
      await migrateLegacyAppointments();

    if (migratedCount > 0) {
      console.info(
        `[appointments] migrated ${migratedCount} legacy appointment records`
      );
    }

    const snapshot =
      await getDocs(
        collection(
          db,
          "admissions_appointments"
        )
      );

    const today =
      new Date();

    today.setHours(0, 0, 0, 0);

    const appointments =
      snapshot.docs
        .map((appointmentDoc) => ({
          id: appointmentDoc.id,
          ...appointmentDoc.data()
        }))
        .filter((appointment) => {
          const appointmentStatus =
            appointment.appointmentStatus ||
            appointment.status ||
            appointment.appointment?.status ||
            "";

          if (
            appointmentStatus !== "scheduled" &&
            appointmentStatus !== "confirmed"
          ) {
            return false;
          }

          const dateValue =
            appointment.appointmentDate ||
            appointment.appointment?.date ||
            "";

          if (!dateValue) {
            return false;
          }

          const appointmentDay =
            new Date(`${dateValue}T12:00:00`);

          if (
            !Number.isFinite(
              appointmentDay.getTime()
            )
          ) {
            return false;
          }

          appointmentDay.setHours(0, 0, 0, 0);

          return appointmentDay >= today;
        })
        .sort((a, b) => {
          const aDateTime =
            `${a.appointmentDate || ""}T` +
            `${a.appointmentTime || "00:00"}`;

          const bDateTime =
            `${b.appointmentDate || ""}T` +
            `${b.appointmentTime || "00:00"}`;

          return (
            new Date(aDateTime).getTime() -
            new Date(bDateTime).getTime()
          );
        });

    if (!appointments.length) {
      appointmentList.innerHTML = `
        <div class="empty">
          No upcoming appointments are currently scheduled.
        </div>
      `;

      setStatus("0 upcoming appointments.");
      return;
    }

    appointmentList.innerHTML =
      appointments
.map((lead) => `
  <article
    class="appointment-card"
    data-id="${esc(lead.id)}"
  >
    <header class="appointment-card-head">
      <div>
        <h2>
          ${esc(lead.athleteName || "Unnamed Athlete")}
        </h2>

        <div class="appointment-sub">
          Parent or Guardian:
          ${esc(lead.parentName || "—")}
        </div>
      </div>

      <span class="status-badge">
        ${esc(
          labelForConfirmationStatus(
            lead.appointmentConfirmationStatus
          )
        )}
      </span>
    </header>

    <div class="appointment-grid">

      <div>
        <span class="field-label">Date</span>
        <div class="field-value">
          ${esc(formatAppointmentDate(lead.appointmentDate))}
        </div>
      </div>

      <div>
        <span class="field-label">Time</span>
        <div class="field-value">
          ${esc(formatAppointmentTime(lead.appointmentTime))}
        </div>
      </div>

      <div>
        <span class="field-label">Academy</span>
        <div class="field-value">
          ${esc(labelForLocation(lead.appointmentLocation))}
        </div>
      </div>

      <div>
        <span class="field-label">Coach</span>
        <div class="field-value">
          ${esc(lead.appointmentCoach || "—")}
        </div>
      </div>

      <div>
        <span class="field-label">Journey</span>
        <div class="field-value">
          ${esc(labelForProgram(lead.programInterest))}
        </div>
      </div>

      <div>
      <span class="field-label">Starting Path</span>
        <div class="field-value">
          ${esc(labelForAdmissionsPath(lead.admissionsPath))}
        </div>
      </div>

      <div>
        <span class="field-label">Primary Goal</span>
        <div class="field-value">
        ${esc(labelForPrimaryGoal(lead.primaryGoal))}
        </div>
      </div>

    </div>

<div class="lead-actions">
  <a
    class="save-btn"
    href="/connect/appointments/?leadId=${esc(lead.id)}"
  >
    Review Appointment
  </a>

  <a
    class="save-btn"
    href="/connect/admissions/?appointmentId=${encodeURIComponent(
      lead.id
    )}"
  >
    Open Admissions
  </a>
</div>
    </article>
`)

      .join("");

const appointmentLabel =
  appointments.length === 1
    ? "appointment"
    : "appointments";

setStatus(
  `${appointments.length} ${appointmentLabel} loaded.`
);

    } catch (error) {
    console.error(
      "[appointments] load failed:",
      error
    );

    const message =
      error?.code === "permission-denied"
        ? "Your account is signed in, but Firestore has not granted access to interest leads."
        : error?.message ||
          "Unable to load appointments.";

    setStatus(message, true);
  }
}

scheduleForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!selectedLeadId || !selectedLead) {
      setStatus(
        "Open this page from a lead before scheduling.",
        true
      );
      return;
    }

    const dateValue =
      String(appointmentDate?.value || "").trim();

    const timeValue =
      String(appointmentTime?.value || "").trim();

    const locationValue =
      String(appointmentLocation?.value || "").trim();

    const coachValue =
      String(appointmentCoach?.value || "").trim();

    const notesValue =
      String(appointmentNotes?.value || "").trim();

    if (
      !dateValue ||
      !timeValue ||
      !locationValue ||
      !coachValue
    ) {
      setStatus(
        "Enter the appointment date, time, academy, and coach.",
        true
      );
      return;
    }

    scheduleBtn.disabled = true;
    scheduleBtn.textContent = "Scheduling...";

    try {
      await requireAdminUser();


  const appointmentRef =
    doc(
      db,
      "admissions_appointments",
      selectedLeadId
    );

  await setDoc(
    appointmentRef,
    {
      appointmentId: selectedLeadId,
      leadId: selectedLeadId,

      participantName:
        selectedLead.athleteName || "",

      athleteName:
        selectedLead.athleteName || "",

      parentName:
        selectedLead.parentName || "",

      registrantRole:
        selectedLead.registrantRole || "",

      athleteAge:
        selectedLead.athleteAge || "",

      email:
        selectedLead.email || "",

      phone:
        selectedLead.phone || "",

      city:
        selectedLead.city || "",

      shirtSize:
        selectedLead.shirtSize || "",

      programInterest:
        selectedLead.programInterest || "",

      intent:
        selectedLead.intent || "",

      primaryGoal:
        selectedLead.primaryGoal || "",

      admissionsPath:
        selectedLead.admissionsPath || "new",

      preferredLocation:
        selectedLead.preferredLocation || "",

      preferredMeetingWindow:
        selectedLead.preferredMeetingWindow || "",

      referralSource:
        selectedLead.referralSource || "",

      leadNotes:
        selectedLead.notes || "",

      appointmentDate: dateValue,
      appointmentTime: timeValue,
      appointmentLocation: locationValue,
      appointmentCoach: coachValue,
      appointmentNotes: notesValue,

      appointmentStatus: "scheduled",
      status: "scheduled",

      appointment: {
        date: dateValue,
        time: timeValue,
        location: locationValue,
        coachName: coachValue,
        notes: notesValue,
        status: "scheduled"
      },

      appointmentConfirmationStatus:
        "pending",

      enrollmentStatus:
        selectedLead.enrollmentStatus ||
        "not_started",

      athleteStatus:
        selectedLead.athleteStatus ||
        "none",

      createdAt:
        selectedLead.appointmentFileCreatedAt ||
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    },
    {
      merge: true
    }
  );

  await updateDoc(
  doc(db, "interest_leads", selectedLeadId),
  {
    appointmentId: selectedLeadId,

    processedToAppointment: true,
    processedAt: serverTimestamp(),

    leadStatus: "appointment_scheduled",
    status: "appointment_scheduled",

    appointmentStatus: "scheduled",

    enrollmentStatus:
      selectedLead.enrollmentStatus || "not_started",

    appointmentDate: dateValue,
    appointmentTime: timeValue,
    appointmentLocation: locationValue,
    appointmentCoach: coachValue,
    appointmentNotes: notesValue,

    appointment: {
      date: dateValue,
      time: timeValue,
      location: locationValue,
      coachName: coachValue,
      notes: notesValue,
      status: "scheduled"
    },

    appointmentScheduledAt: serverTimestamp(),

    // Confirmation has been requested but not necessarily sent.
    appointmentConfirmationStatus: "pending",
    appointmentConfirmationRequestedAt:
      serverTimestamp(),

    athleteStatus:
      selectedLead.athleteStatus || "none",

    updatedAt: serverTimestamp()
  }
);

selectedLead.leadStatus = "appointment_scheduled";
selectedLead.status = "appointment_scheduled";
selectedLead.appointmentStatus = "scheduled";

selectedLead.appointmentDate = dateValue;
selectedLead.appointmentTime = timeValue;
selectedLead.appointmentLocation = locationValue;
selectedLead.appointmentCoach = coachValue;
selectedLead.appointmentNotes = notesValue;

setStatus(
  "Appointment processed and scheduled. Confirmation is pending."
);

await loadAppointments();


    } catch (error) {
      console.error(
        "[appointments] schedule failed:",
        error
      );

      setStatus(
        error?.message ||
          "Unable to schedule the appointment.",
        true
      );
    } finally {
      scheduleBtn.disabled = false;
scheduleBtn.textContent =
  selectedLead.appointmentStatus === "scheduled"
    ? "Update & Send Confirmation"
    : "Schedule & Send Confirmation";
    }
  }
);

refreshBtn?.addEventListener(
  "click",
  async () => {
    await loadAppointments();
  }
);

try {
  await requireAdminUser();
  await loadSelectedLead();
  await loadAppointments();
} catch (error) {
  console.error("[appointments] boot failed:", error);

  setStatus(
    error?.message || "Unable to open appointments.",
    true
  );
}
