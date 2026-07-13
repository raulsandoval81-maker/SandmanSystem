import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const leadList = document.getElementById("leadList");
const pageStatus = document.getElementById("pageStatus");

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const programFilter = document.getElementById("programFilter");
const refreshBtn = document.getElementById("refreshBtn");

const countAll = document.getElementById("countAll");
const countNew = document.getElementById("countNew");
const countContacted = document.getElementById("countContacted");
const countAppointments = document.getElementById("countAppointments");

let leads = [];

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

function formatDate(value) {
  if (!value) return "—";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "—";
}

function labelForStatus(status = "new") {
  const labels = {
    new: "New",
    contacted: "Contacted",
    appointment_scheduled: "Appointment Scheduled",
    ready_for_intake: "Ready for Intake",
    intake_started: "Intake Started",
    converted: "Converted",
    closed: "Closed"
  };

  return labels[status] || status;
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

function updateCounts() {
  if (countAll) countAll.textContent = leads.length;

  if (countNew) {
    countNew.textContent =
      leads.filter((lead) => lead.status === "new").length;
  }

  if (countContacted) {
    countContacted.textContent =
      leads.filter((lead) => lead.status === "contacted").length;
  }

  if (countAppointments) {
countAppointments.textContent =
  leads.filter((lead) =>
    lead.appointmentStatus === "scheduled" ||
    lead.appointment?.status === "scheduled" ||
    lead.status === "appointment_scheduled"
  ).length;

  }
}

function filteredLeads() {
  const query =
    String(searchInput?.value || "")
      .trim()
      .toLowerCase();

  const wantedStatus =
    String(statusFilter?.value || "all");

  const wantedProgram =
    String(programFilter?.value || "all");

  return leads.filter((lead) => {
const leadStatus =
  lead.leadStatus ||
  lead.status ||
  "new";

if (
  wantedStatus !== "all" &&
  leadStatus !== wantedStatus
) {
  return false;
}

    if (
      wantedProgram !== "all" &&
      lead.programInterest !== wantedProgram
    ) {
      return false;
    }

    if (!query) return true;

    const haystack = [
      lead.parentName,
      lead.athleteName,
      lead.email,
      lead.phone,
      lead.city,
      lead.programInterest
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function statusOptions(selected = "new") {
  const values = [
    "new",
    "contacted",
    "appointment_scheduled",
    "ready_for_intake",
    "intake_started",
    "converted",
    "closed"
  ];

  return values
    .map((value) => {
      const isSelected =
        value === selected
          ? "selected"
          : "";

      return `
        <option value="${value}" ${isSelected}>
          ${labelForStatus(value)}
        </option>
      `;
    })
    .join("");
}

function render() {
  if (!leadList) return;

  const list = filteredLeads();

  if (!list.length) {
    leadList.innerHTML = `
      <div class="empty">
        No leads match the current filters.
      </div>
    `;

    return;
  }

  leadList.innerHTML = list
    .map((lead) => {
        const status =
        lead.leadStatus ||
        lead.status ||
        "new";

      return `
        <article class="lead-card" data-id="${esc(lead.id)}">

          <header class="lead-card-head">
            <div>
              <h2>${esc(lead.athleteName || "Unnamed Athlete")}</h2>

              <div class="lead-sub">
                Parent or Guardian:
                ${esc(lead.parentName || "—")}
              </div>
            </div>

            <span class="status-badge status-${esc(status)}">
              ${esc(labelForStatus(status))}
            </span>
          </header>

          <div class="lead-grid">

            <div>
              <span class="field-label">Age</span>
              <div class="field-value">
                ${esc(lead.athleteAge ?? "—")}
              </div>
            </div>

            <div>
              <span class="field-label">Program</span>
              <div class="field-value">
                ${esc(labelForProgram(lead.programInterest))}
              </div>
            </div>

            <div>
              <span class="field-label">Membership</span>
              <div class="field-value">
                ${esc(lead.intent || "General")}
              </div>
            </div>

            <div>
              <span class="field-label">Preferred Academy</span>
              <div class="field-value">
                ${esc(lead.preferredLocation || "—")}
              </div>
            </div>

            <div>
              <span class="field-label">Meeting Window</span>
              <div class="field-value">
                ${esc(lead.preferredMeetingWindow || "—")}
              </div>
            </div>

            <div>
              <span class="field-label">Experience</span>
              <div class="field-value">
                ${esc(lead.experience || "—")}
              </div>
            </div>

            <div>
              <span class="field-label">Submitted</span>
              <div class="field-value">
                ${esc(formatDate(lead.createdAt))}
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

            <div>
              <span class="field-label">City</span>
              <div class="field-value">
                ${esc(lead.city || "—")}
              </div>
            </div>

            <div>
              <span class="field-label">Referral</span>
              <div class="field-value">
                ${esc(lead.referralSource || "—")}
              </div>
            </div>

          </div>

          ${
            lead.notes
              ? `
                <div class="lead-notes">
                  ${esc(lead.notes)}
                </div>
              `
              : ""
          }

          <div class="lead-actions">
            <select data-status-select="${esc(lead.id)}">
              ${statusOptions(status)}
            </select>

            <button
              class="save-btn"
              type="button"
              data-save-status="${esc(lead.id)}"
            >
              Save Status
            </button>

            <a
              class="save-btn"
              href="/connect/appointments/?leadId=${esc(lead.id)}"
            >
              Schedule Appointment
            </a>
          </div>

        </article>
      `;
    })
    .join("");
}

async function loadLeads() {
  setStatus("Loading leads...");

  try {
    const snapshot =
      await getDocs(collection(db, "interest_leads"));

    leads = snapshot.docs
      .map((leadDoc) => ({
        id: leadDoc.id,
        ...leadDoc.data()
      }))
      .sort((a, b) => {
        const aDate =
          typeof a.createdAt?.toMillis === "function"
            ? a.createdAt.toMillis()
            : 0;

        const bDate =
          typeof b.createdAt?.toMillis === "function"
            ? b.createdAt.toMillis()
            : 0;

        return bDate - aDate;
      });

    updateCounts();
    render();

    setStatus(`${leads.length} leads loaded.`);
  } catch (error) {
    console.error("[leads] load failed:", error);

    setStatus(
      "Unable to load leads. Check authentication and Firestore rules.",
      true
    );
  }
}

async function saveStatus(leadId) {
  const select =
    document.querySelector(
      `[data-status-select="${CSS.escape(leadId)}"]`
    );

  if (!select) return;

  const nextStatus = select.value;

  const lead =
    leads.find((item) => item.id === leadId);

  if (!lead) return;

  try {
    setStatus("Saving status...");

  const updates = {
     leadStatus: nextStatus,
     status: nextStatus, // temporary compatibility
     updatedAt: serverTimestamp()
   };
    if (
      nextStatus === "contacted" &&
      !lead.contactedAt
    ) {
      updates.contactedAt = serverTimestamp();
    }

    if (
      nextStatus === "appointment_scheduled" &&
      !lead.appointmentScheduledAt
    ) {
      updates.appointmentScheduledAt =
        serverTimestamp();
    }

    if (
      nextStatus === "intake_started" &&
      !lead.intakeStartedAt
    ) {
      updates.intakeStartedAt =
        serverTimestamp();
    }

    if (
      nextStatus === "converted" &&
      !lead.enrolledAt
    ) {
      updates.enrolledAt =
        serverTimestamp();
    }

    if (
      nextStatus === "closed" &&
      !lead.closedAt
    ) {
      updates.closedAt =
        serverTimestamp();
    }

    await updateDoc(
      doc(db, "interest_leads", leadId),
      updates
    );

     lead.leadStatus = nextStatus;
     lead.status = nextStatus;

    if (
      nextStatus === "contacted" &&
      !lead.contactedAt
    ) {
      lead.contactedAt = new Date();
    }

    if (
      nextStatus === "appointment_scheduled" &&
      !lead.appointmentScheduledAt
    ) {
      lead.appointmentScheduledAt = new Date();
    }

    if (
      nextStatus === "intake_started" &&
      !lead.intakeStartedAt
    ) {
      lead.intakeStartedAt = new Date();
    }

    if (
      nextStatus === "converted" &&
      !lead.enrolledAt
    ) {
      lead.enrolledAt = new Date();
    }

    if (
      nextStatus === "closed" &&
      !lead.closedAt
    ) {
      lead.closedAt = new Date();
    }

    updateCounts();
    render();

    setStatus("Lead status updated.");
  } catch (error) {
    console.error(
      "[leads] status update failed:",
      error
    );

    setStatus(
      "Unable to update lead status.",
      true
    );
  }
}
searchInput?.addEventListener("input", render);
statusFilter?.addEventListener("change", render);
programFilter?.addEventListener("change", render);
refreshBtn?.addEventListener("click", loadLeads);

leadList?.addEventListener("click", (event) => {
  const button =
    event.target.closest("[data-save-status]");

  if (!button) return;

  saveStatus(button.dataset.saveStatus);
});

await loadLeads();