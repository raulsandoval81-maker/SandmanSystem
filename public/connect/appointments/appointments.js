import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
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
    "z2h-wrestling": "Zero2Hero Wrestling",
    "z2h-kickboxing": "Zero2Hero Kickboxing",
    "p2l-wrestling": "Path2Legend Wrestling",
    "p2l-boxing": "Path2Legend Boxing",
    "learning-more": "Just Learning More"
  };

  return labels[program] || program || "—";
}

function labelForIntent(intent = "") {
  const labels = {
    "academy-introduction": "Academy Introduction",
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

async function requireAdminUser() {
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }

  const user = auth.currentUser;

  if (!user) {
    throw new Error("Admin login required.");
  }

  if (user.isAnonymous) {
    throw new Error(
      "Anonymous users cannot access the appointments dashboard."
    );
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
        <h3>
          ${esc(selectedLead.athleteName || "Unnamed Athlete")}
        </h3>

        <p>
          Parent or Guardian:
          <strong>${esc(selectedLead.parentName || "—")}</strong>
        </p>

        <p>
          Journey:
          <strong>
            ${esc(labelForProgram(selectedLead.programInterest))}
          </strong>
        </p>

        <p>
          Membership Interest:
          <strong>
            ${esc(labelForIntent(selectedLead.intent))}
          </strong>
        </p>

        <p>
          Preferred Academy:
          <strong>
            ${esc(labelForLocation(selectedLead.preferredLocation))}
          </strong>
        </p>

        <p>
          Preferred Meeting Window:
          <strong>
            ${esc(selectedLead.preferredMeetingWindow || "—")}
          </strong>
        </p>
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

  if (schedulePanel) {
    schedulePanel.hidden = false;
  }
}

async function loadAppointments() {
  if (!appointmentList) return;

  setStatus("Loading appointments...");

  try {
    await requireAdminUser();

    const snapshot =
      await getDocs(
        collection(db, "interest_leads")
      );

    const appointments =
      snapshot.docs
        .map((leadDoc) => ({
          id: leadDoc.id,
          ...leadDoc.data()
        }))
        .filter(
          (lead) =>
            lead.status === "appointment_scheduled"
        );

    if (!appointments.length) {
      appointmentList.innerHTML = `
        <div class="empty">
          No appointments are currently scheduled.
        </div>
      `;

      setStatus("0 appointments loaded.");
      return;
    }

    appointmentList.innerHTML =
      appointments
        .map((lead) => `
          <article
            class="appointment-card"
            data-id="${esc(lead.id)}"
          >
            <h2>
              ${esc(lead.athleteName || "Unnamed Athlete")}
            </h2>

            <div class="appointment-sub">
              Parent or Guardian:
              ${esc(lead.parentName || "—")}
            </div>

            <div class="appointment-grid">
              <div>
                <span class="field-label">Journey</span>
                <div class="field-value">
                  ${esc(labelForProgram(lead.programInterest))}
                </div>
              </div>

              <div>
                <span class="field-label">Membership</span>
                <div class="field-value">
                  ${esc(labelForIntent(lead.intent))}
                </div>
              </div>

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
                <span class="field-label">Phone</span>
                <div class="field-value">
                  ${esc(lead.phone || "—")}
                </div>
              </div>

              <div>
                <span class="field-label">Email</span>
                <div class="field-value">
                  ${esc(lead.email || "—")}
                </div>
              </div>
            </div>
          </article>
        `)
        .join("");

    setStatus(
      `${appointments.length} appointments loaded.`
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

      await updateDoc(
        doc(db, "interest_leads", selectedLeadId),
        {
          status: "appointment_scheduled",

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

          appointmentConfirmationStatus: "pending",
          appointmentConfirmationRequestedAt:
            serverTimestamp(),

          updatedAt: serverTimestamp()
        }
      );

      setStatus(
        "Appointment scheduled. Gatekeeper confirmation queued."
      );

      await loadAppointments();

      scheduleForm.reset();

      if (appointmentCoach) {
        appointmentCoach.value = "Coach Sandoval";
      }
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
        "Schedule & Send Confirmation";
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
