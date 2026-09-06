import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

import {
  requireManagement,
  managementLoginUrl
} from "/management/shared/guards/management-guard.js";

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

const selectedLeadId =
  params.get("leadId") || "";

const selectedRequestId =
  params.get("requestId") || "";

const selectedSourceId =
  selectedLeadId ||
  selectedRequestId;

const selectedSourceCollection =
  selectedRequestId
    ? "admissions_requests"
    : "interest_leads";

let selectedLead = null;
let managementContext = null;
let coachDirectory = [];

function clean(value) {
  return String(value ?? "").trim();
}

async function loadCoachDirectory() {
  const snapshot = await getDocs(
    collection(db, "staff")
  );

  coachDirectory = snapshot.docs
    .map((staffDoc) => ({
      id: staffDoc.id,
      ...staffDoc.data()
    }))
    .filter((staff) =>
      clean(staff.role).toLowerCase() === "coach" &&
      clean(staff.status).toLowerCase() === "active"
    )
    .sort((a, b) =>
      clean(
        a.fullName ||
        a.displayName ||
        a.email ||
        a.id
      ).localeCompare(
        clean(
          b.fullName ||
          b.displayName ||
          b.email ||
          b.id
        )
      )
    );
}

function coachDisplayName(coach) {
  return clean(
    coach?.fullName ||
    coach?.displayName ||
    coach?.email ||
    coach?.id
  );
}

function populateAppointmentCoachSelect(record = null) {
  if (!appointmentCoach) return;

  appointmentCoach.replaceChildren();

  const placeholder =
    document.createElement("option");

  placeholder.value = "";
  placeholder.textContent =
    "Select an active coach";

  appointmentCoach.appendChild(
    placeholder
  );

  for (const coach of coachDirectory) {
    const option =
      document.createElement("option");

    option.value = coach.id;

    const name =
      coachDisplayName(coach);

    const email =
      clean(coach.email);

    option.textContent =
      email && email !== name
        ? `${name} — ${email}`
        : name;

    appointmentCoach.appendChild(
      option
    );
  }

  const assignedCoachUid =
    clean(record?.appointmentCoachUid);

  if (
    assignedCoachUid &&
    coachDirectory.some(
      (coach) => coach.id === assignedCoachUid
    )
  ) {
    appointmentCoach.value =
      assignedCoachUid;
  }
}

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

    "quest2mastery-sub-grappling":
      "Quest2Mastery Submission Grappling",

    "quest2mastery-submission-grappling":
      "Quest2Mastery Submission Grappling",

    fitness:
      "Everyday Fitness",

    "not-sure":
      "Not Sure"
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
    "santa-ynez-valley": "Santa Ynez Valley",
    "elk-grove": "Elk Grove",
    either: "Either Location"
  };

  return labels[location] || location || "—";
}


function labelForClaimedExperienceRange(value = "") {
  const labels = {
    "under-1": "Less than 1 year",
    "1-2": "1–2 years",
    "2-3": "2–3 years",
    "3-plus": "3+ years"
  };

  return labels[value] || "—";
}

function renderReportedExperience(record) {
  const claimed =
    String(
      record.claimedPriorExperience || ""
    ).trim();

  /*
   * Family-reported information only.
   * Never infer verification from admissionsPath.
   */
  if (!claimed) {
    return "Not reported";
  }

  if (claimed === "no") {
    return "No previous experience reported";
  }

  if (claimed !== "yes") {
    return "Not reported";
  }

  const range =
    labelForClaimedExperienceRange(
      record.claimedExperienceRange
    );

  const notes =
    String(
      record.claimedExperienceNotes || ""
    ).trim();

  return `
    Family reported previous experience<br>
    <strong>Reported duration:</strong>
    ${esc(range)}
    ${
      notes
        ? `<br><strong>Background:</strong> ${esc(notes)}`
        : ""
    }
    <br><strong>Status:</strong>
    Pending Coach verification
  `;
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

    exploring:
      "Just Exploring",

    discipline:
      "Character & Discipline",

    fun:
      "Fun",

    health:
      "Fitness & Health",

    weightloss:
      "Weight Loss",

    "weight-loss":
      "Weight Loss"
  };

  return labels[value] || value || "—";
}
function labelForInterestType(value = "") {
  const labels = {
    combat:
      "Sandman Combat",

    fitness:
      "Sandman Fitness",

    both:
      "Sandman Combat & Fitness"
  };

  return labels[value] || value || "—";
}

function labelForReferralSource(value = "") {
  const labels = {
    tournament:
      "Tournament or Event",

    "friend-family":
      "Friend or Family",

    school:
      "School",

    "social-media":
      "Social Media",

    website:
      "Website",

    flyer:
      "Flyer or QR Code",

    other:
      "Other"
  };

  return labels[value] || value || "—";
}

async function requireManagementSession() {
  if (managementContext) {
    return managementContext;
  }

  try {
    managementContext =
      await requireManagement();

    return managementContext;
  } catch (error) {
    console.error(
      "[appointments] management access failed:",
      error
    );

    window.location.replace(
      managementLoginUrl()
    );

    throw error;
  }
}

function canAccessLocation(locationId = "") {
  if (!managementContext) {
    return false;
  }

  if (managementContext.isSystemAdmin) {
    return true;
  }

  const normalizedLocationId =
    String(locationId || "")
      .trim()
      .toLowerCase();

  if (!normalizedLocationId) {
    return false;
  }

  return managementContext.scope.locationIds
    .includes(normalizedLocationId);
}

async function loadSelectedLead() {
  if (!selectedSourceId) return;

  const sourceSnapshot =
    await getDoc(
      doc(
        db,
        selectedSourceCollection,
        selectedSourceId
      )
    );

  if (!sourceSnapshot.exists()) {
    throw new Error(
      selectedRequestId
        ? "Selected admissions request was not found."
        : "Selected lead was not found."
    );
  }

  const sourceData =
    sourceSnapshot.data() || {};

  selectedLead = {
    id: sourceSnapshot.id,
    ...sourceData,

    // Canonical identity/contact normalization.
    athleteName:
      sourceData.athleteName ||
      sourceData.participantName ||
      "",

    parentName:
      sourceData.parentName ||
      sourceData.guardianName ||
      sourceData.contactName ||
      "",

    dob:
      sourceData.dob ||
      sourceData.dateOfBirth ||
      "",

    dateOfBirth:
      sourceData.dateOfBirth ||
      sourceData.dob ||
      "",

    email:
      sourceData.email ||
      sourceData.parentEmail ||
      "",

    phone:
      sourceData.phone ||
      sourceData.parentPhone ||
      "",

    city:
      sourceData.city || "",

    state:
      sourceData.state || "",

    locationId:
      sourceData.locationId ||
      sourceData.location ||
      sourceData.preferredLocation ||
      "",

    programInterest:
      sourceData.programInterest ||
      sourceData.journey ||
      sourceData.journeyId ||
      "",

    admissionsRequestId:
      selectedRequestId || null,

    leadId:
      selectedLeadId || null,

    sourceType:
      selectedRequestId
        ? "admissions_request"
        : "interest_lead"
  };

  if (
    !canAccessLocation(
      selectedLead.locationId
    )
  ) {
    selectedLead = null;

    throw new Error(
      "This lead is outside your assigned Management location."
    );
  }

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
  <strong>Athlete T-Shirt Size:</strong>
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
  <strong>Program Area:</strong>
  ${esc(
    labelForInterestType(
      selectedLead.interestType
    )
  )}
</p>

<p>
  <strong>Primary Goal:</strong>
  ${esc(labelForPrimaryGoal(selectedLead.primaryGoal))}
</p>

<p>
  <strong>Prior Experience:</strong><br>
  ${renderReportedExperience(selectedLead)}
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
${esc(
  labelForReferralSource(
    selectedLead.referralSource
  )
)}
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

  appointmentDate.value =
    selectedLead.appointmentDate || "";

  appointmentTime.value =
    selectedLead.appointmentTime || "";

  appointmentNotes.value =
    selectedLead.appointmentNotes || "";

if (scheduleBtn) {
  scheduleBtn.disabled = false;

  if (
    selectedLead.appointmentStatus === "scheduled"
  ) {
    scheduleBtn.textContent =
      "Update Appointment";
  } else {
    scheduleBtn.textContent =
      "Schedule Appointment";
  }
}

  if (schedulePanel) {
    schedulePanel.hidden = false;
  }
}

async function migrateLegacyAppointments() {
  await requireManagementSession();

  let legacySnapshots = [];

  if (managementContext.isSystemAdmin) {
    legacySnapshots = [
      await getDocs(
        collection(db, "interest_leads")
      )
    ];
  } else {
    const locationIds =
      managementContext.scope.locationIds;

    for (
      let index = 0;
      index < locationIds.length;
      index += 10
    ) {
      const locationChunk =
        locationIds.slice(
          index,
          index + 10
        );

      legacySnapshots.push(
        await getDocs(
          query(
            collection(
              db,
              "interest_leads"
            ),
            where(
              "locationId",
              "in",
              locationChunk
            )
          )
        )
      );
    }
  }

  const legacyDocs =
    legacySnapshots.flatMap(
      (snapshot) => snapshot.docs
    );

  const legacyAppointments =
    legacyDocs
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
      const current =
        existingAppointment.data() || {};

      const backfill = {};

      const fillIfMissing = (
        field,
        value
      ) => {
        if (
          !String(current[field] || "").trim() &&
          String(value || "").trim()
        ) {
          backfill[field] = value;
        }
      };

      fillIfMissing(
        "athleteName",
        lead.athleteName
      );

      fillIfMissing(
        "participantName",
        lead.athleteName
      );

      fillIfMissing(
        "parentName",
        lead.parentName ||
        lead.guardianName
      );

      fillIfMissing(
        "dob",
        lead.dob ||
        lead.dateOfBirth
      );

      fillIfMissing(
        "city",
        lead.city
      );

      fillIfMissing(
        "state",
        lead.state
      );

      fillIfMissing(
        "email",
        lead.email ||
        lead.parentEmail
      );

      fillIfMissing(
        "phone",
        lead.phone ||
        lead.parentPhone
      );

      fillIfMissing(
        "leadId",
        lead.id
      );

      if (
        Object.keys(backfill).length
      ) {
        await setDoc(
          appointmentRef,
          backfill,
          { merge: true }
        );

        migratedCount += 1;
      }

      continue;
    }

    await setDoc(
      appointmentRef,
      {
        appointmentId: lead.id,
        leadId: lead.id,

        academyId:
          lead.academyId || "",

        organizationId:
          lead.organizationId || "",

        locationId:
          lead.locationId || "",

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

        dob:
          lead.dob ||
          lead.dateOfBirth ||
          "",

        city:
          lead.city || "",

        state:
          lead.state || "",

        email:
          lead.email ||
          lead.parentEmail ||
          "",

        phone:
          lead.phone ||
          lead.parentPhone ||
          "",

        shirtSize:
          lead.shirtSize || "",

        programInterest:
          lead.programInterest || "",

        intent:
          lead.intent || "",

        primaryGoal:
          lead.primaryGoal || "",

        /*
         * Family-reported experience only.
         * These fields do not constitute Coach verification.
         */
        claimedPriorExperience:
          lead.claimedPriorExperience || "",

        claimedExperienceRange:
          lead.claimedExperienceRange || "",

        claimedExperienceNotes:
          lead.claimedExperienceNotes || "",

        admissionsPath:
          lead.admissionsPath || "new",

        entryMode:
          lead.entryMode || "online",

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
    await requireManagementSession();

    const migratedCount =
      await migrateLegacyAppointments();

    if (migratedCount > 0) {
      console.info(
        `[appointments] migrated ${migratedCount} legacy appointment records`
      );
    }

    let appointmentSnapshots = [];

    if (managementContext.isSystemAdmin) {
      appointmentSnapshots = [
        await getDocs(
          collection(
            db,
            "admissions_appointments"
          )
        )
      ];
    } else {
      const locationIds =
        managementContext.scope.locationIds;

      for (
        let index = 0;
        index < locationIds.length;
        index += 10
      ) {
        const locationChunk =
          locationIds.slice(
            index,
            index + 10
          );

        appointmentSnapshots.push(
          await getDocs(
            query(
              collection(
                db,
                "admissions_appointments"
              ),
              where(
                "locationId",
                "in",
                locationChunk
              )
            )
          )
        );
      }
    }

    const appointmentDocs =
      appointmentSnapshots.flatMap(
        (snapshot) => snapshot.docs
      );

    const today =
      new Date();

    today.setHours(0, 0, 0, 0);

    const appointments =
      appointmentDocs
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
        <span class="field-label">Prior Experience</span>
        <div class="field-value">
          ${renderReportedExperience(lead)}
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
  class="save-btn save-btn--admissions"
  href="/connect/admissions/?appointmentId=${encodeURIComponent(
    lead.id
  )}"
>
  Open Admissions →
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
      String(selectedLead.locationId || "").trim();

    /*
     * Coach assignment is not required to schedule a
     * Management admissions appointment.
     * Technical verification is a separate downstream handoff.
     */
    const coachUid = "";
    const coachValue = "";

    const notesValue =
      String(appointmentNotes?.value || "").trim();

    if (
      !dateValue ||
      !timeValue ||
      !locationValue
    ) {
      setStatus(
        "Enter the appointment date and time.",
        true
      );
      return;
    }

    scheduleBtn.disabled = true;
    scheduleBtn.textContent = "Scheduling...";

    try {
      await requireManagementSession();

      if (
        !selectedLead ||
        !canAccessLocation(
          selectedLead.locationId
        )
      ) {
        throw new Error(
          "This lead is outside your assigned Management location."
        );
      }

  const appointmentRef =
    doc(
      db,
      "admissions_appointments",
      selectedSourceId
    );

  await setDoc(
    appointmentRef,
    {
      appointmentId: selectedSourceId,

      leadId:
        selectedLeadId || null,

      admissionsRequestId:
        selectedRequestId || null,

      sourceType:
        selectedRequestId
          ? "admissions_request"
          : "interest_lead",

      academyId:
        selectedLead.academyId || "",

      organizationId:
        selectedLead.organizationId || "",

      locationId:
        selectedLead.locationId || "",

      participantName:
        selectedLead.athleteName || "",

      athleteName:
        selectedLead.athleteName || "",

      parentName:
        selectedLead.parentName ||
        selectedLead.guardianName ||
        selectedLead.contactName ||
        "",

      registrantRole:
        selectedLead.registrantRole || "",

      athleteAge:
        selectedLead.athleteAge || "",

      dob:
        selectedLead.dob ||
        selectedLead.dateOfBirth ||
        "",

      city:
        selectedLead.city || "",

      state:
        selectedLead.state || "",

      email:
        selectedLead.email || "",

      phone:
        selectedLead.phone || "",

      city:
        selectedLead.city || "",

      shirtSize:
        selectedLead.shirtSize || "",

      programInterest:
        selectedLead.programInterest ||
        selectedLead.journey ||
        selectedLead.journeyId ||
        "",

      intent:
        selectedLead.intent || "",

      primaryGoal:
        selectedLead.primaryGoal || "",

      /*
       * Family-reported experience only.
       * Coach verification is a separate downstream action.
       */
      claimedPriorExperience:
        selectedLead.claimedPriorExperience || "",

      claimedExperienceRange:
        selectedLead.claimedExperienceRange || "",

      claimedExperienceNotes:
        selectedLead.claimedExperienceNotes || "",

      admissionsPath:
        selectedLead.admissionsPath || "new",

      entryMode:
        selectedLead.entryMode || "online",

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
      appointmentCoachUid: coachUid,
      appointmentNotes: notesValue,

      appointmentStatus: "scheduled",
      status: "scheduled",

      appointment: {
        date: dateValue,
        time: timeValue,
        location: locationValue,
        coachName: coachValue,
        coachUid: coachUid,
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
    appointmentCoachUid: coachUid,
    appointmentNotes: notesValue,

    appointment: {
      date: dateValue,
      time: timeValue,
      location: locationValue,
      coachName: coachValue,
      coachUid: coachUid,
      notes: notesValue,
      status: "scheduled"
    },

    appointmentScheduledAt: serverTimestamp(),

    // Confirmation has been requested but not necessarily sent.
appointmentConfirmationStatus:
  "pending",

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
selectedLead.appointmentCoachUid = coachUid;
selectedLead.appointmentNotes = notesValue;

setStatus(
  "Appointment has been scheduled. Gatekeeper will send the initial confirmation email."
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
      if (scheduleBtn) {
        scheduleBtn.disabled = false;

        if (
          selectedLead?.appointmentStatus === "scheduled"
        ) {
          scheduleBtn.textContent =
            "Update Appointment";
        } else {
          scheduleBtn.textContent =
            "Schedule Appointment";
        }
      }
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
  await requireManagementSession();
  await loadCoachDirectory();
  await loadSelectedLead();
  await loadAppointments();
} catch (error) {
  console.error("[appointments] boot failed:", error);

  setStatus(
    error?.message || "Unable to open appointments.",
    true
  );
}
