import {
  db,
  auth,
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

import {
  requireManagement,
  managementLoginUrl
} from "/management/shared/guards/management-guard.js";

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
let managementContext = null;

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
    "zero2hero-wrestling": "Zero2Hero Wrestling",
    "z2h-wrestling": "Zero2Hero Wrestling",

    "zero2hero-kickboxing": "Zero2Hero Muay Thai",
    "z2h-kickboxing": "Zero2Hero Muay Thai",

    "path2legend-wrestling": "Path2Legend Wrestling",
    "p2l-wrestling": "Path2Legend Wrestling",

    "path2legend-boxing": "Path2Legend Boxing",
    "p2l-boxing": "Path2Legend Boxing",

    fitness: "Everyday Fitness",
    "learning-more": "Just Learning More"
  };

  return labels[program] || program || "—";
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
      "Saturday Afternoon (12:00 PM – 4:00 PM)"
  };

  return labels[value] || value || "—";
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
function labelForClaimedExperienceRange(value = "") {
  const labels = {
    "under-1": "Less than 1 year",
    "1-2": "1–2 years",
    "2-3": "2–3 years",
    "3-plus": "3+ years"
  };

  return labels[value] || "—";
}

function renderReportedExperience(lead) {
  const claimed =
    String(
      lead.claimedPriorExperience || ""
    ).trim();

  /*
   * Older leads may not have the new claim fields.
   * Do not infer experience from admissionsPath.
   */
  if (!claimed) {
    return `
      <div class="field-value">
        Not reported
      </div>
    `;
  }

  if (claimed === "no") {
    return `
      <div class="field-value">
        No previous experience reported
      </div>
    `;
  }

  if (claimed !== "yes") {
    return `
      <div class="field-value">
        Not reported
      </div>
    `;
  }

  const range =
    labelForClaimedExperienceRange(
      lead.claimedExperienceRange
    );

  const notes =
    String(
      lead.claimedExperienceNotes || ""
    ).trim();

  return `
    <div class="field-value">
      Family reported previous experience
    </div>

    <div class="lead-sub">
      Reported duration:
      ${esc(range)}
    </div>

    ${
      notes
        ? `
          <div class="lead-sub">
            ${esc(notes)}
          </div>
        `
        : ""
    }

    <div class="lead-sub">
      Pending Coach verification
    </div>
  `;
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
              <span class="field-label">Preferred Academy</span>
              <div class="field-value">
                ${esc(lead.locationId || "—")}
              </div>
            </div>

            <div>
              <span class="field-label">Meeting Window</span>
              <div class="field-value">
              ${esc(labelForMeetingWindow(lead.preferredMeetingWindow))}
              </div>
            </div>

            <div>
              <span class="field-label">
                Prior Experience
              </span>

              ${renderReportedExperience(lead)}
            </div>

            <div>
              <span class="field-label">Submitted</span>
              <div class="field-value">
                ${esc(formatDate(lead.createdAt))}
              </div>
            </div>

          </div>

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

  <button
    class="save-btn delete-btn"
    type="button"
    data-delete-lead="${esc(lead.id)}"
  >
    Delete Lead
  </button>
</div>

        </article>
      `;
    })
    .join("");
}
function buildLoginUrl() {
  const returnTo =
    window.location.pathname +
    window.location.search;

  return (
    "/management/auth/?returnUrl=" +
    encodeURIComponent(returnTo)
  );
}

function redirectToStaffLogin() {
  window.location.href =
    buildLoginUrl();
}

async function waitForAuthState() {
  for (
    let attempt = 0;
    attempt < 12;
    attempt += 1
  ) {
    if (auth.currentUser) {
      return auth.currentUser;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return auth.currentUser || null;
}

async function requireStaffSession() {
  setStatus("Checking management session...");

  try {
    managementContext =
      await requireManagement();

    return true;
  } catch (error) {
    console.error(
      "[leads] management access failed:",
      error
    );

    window.location.replace(
      managementLoginUrl()
    );

    return false;
  }
}

async function loadLeads() {
  setStatus("Loading leads...");

  try {
    if (!managementContext) {
      throw new Error(
        "Management context is unavailable."
      );
    }

    let snapshots = [];

    if (managementContext.isSystemAdmin) {
      snapshots = [
        await getDocs(
          collection(db, "interest_leads")
        )
      ];
    } else {
      const locationIds =
        managementContext.scope.locationIds;

      if (!locationIds.length) {
        leads = [];
        updateCounts();
        render();

        setStatus(
          "No locations are assigned to this Management profile."
        );

        return;
      }

      /*
       * Firestore "in" queries are intentionally
       * chunked so Management scope can grow beyond
       * a single location without changing this page.
       */
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

        snapshots.push(
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

    const leadMap = new Map();

    for (const snapshot of snapshots) {
      for (const leadDoc of snapshot.docs) {
        leadMap.set(
          leadDoc.id,
          {
            id: leadDoc.id,
            ...leadDoc.data()
          }
        );
      }
    }

    leads = Array.from(
      leadMap.values()
    )
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
async function deleteLead(leadId) {

  const ok = confirm(
    "Delete this lead permanently?\n\nThis cannot be undone."
  );

  if (!ok) return;

  try {

    await deleteDoc(
      doc(db, "interest_leads", leadId)
    );

    alert("Lead deleted.");

    loadLeads();

  } catch (err) {

    console.error(err);

    alert("Unable to delete lead.");
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

  const saveButton =
    event.target.closest("[data-save-status]");

  if (saveButton) {
    saveStatus(saveButton.dataset.saveStatus);
    return;
  }

  const deleteButton =
    event.target.closest("[data-delete-lead]");

  if (deleteButton) {
    deleteLead(deleteButton.dataset.deleteLead);
    return;
  }

});

if (
  await requireStaffSession()
) {
  await loadLeads();
}