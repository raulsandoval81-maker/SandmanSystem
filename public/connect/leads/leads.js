import {
  db,
  auth,
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  setDoc,
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
const countWaiting = document.getElementById("countWaiting");
const countIssue = document.getElementById("countIssue");

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

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function triageForLead(lead, now = Date.now()) {
  const createdAt = timestampMillis(lead.createdAt);
  if (!createdAt) return { key: "issue", label: "Issue", age: "Age unavailable" };

  const ageHours = Math.max(0, (now - createdAt) / 3_600_000);
  if (ageHours < 24) {
    return { key: "new", label: "New", age: `${Math.floor(ageHours)}h old` };
  }
  if (ageHours < 72) {
    return { key: "waiting", label: "Waiting", age: `${Math.floor(ageHours)}h old` };
  }
  return { key: "issue", label: "Issue", age: `${Math.floor(ageHours / 24)}d old` };
}

function isActiveLead(lead) {
  const status = String(lead.leadStatus || lead.status || "new").trim();
  const downstreamStatuses = new Set([
    "appointment_scheduled",
    "ready_for_proposal",
    "ready_for_intake",
    "ready_to_enroll",
    "ready-to-enroll",
    "intake_started",
    "converted",
    "closed"
  ]);

  return !(
    downstreamStatuses.has(status) ||
    lead.processedToAppointment === true ||
    lead.appointmentStatus === "scheduled" ||
    lead.appointment?.status === "scheduled" ||
    lead.walkInEnrollment === true
  );
}

function labelForProgram(program = "") {
  const labels = {
    "zero2hero-wrestling": "Road2Champion Wrestling",
    "z2h-wrestling": "Road2Champion Wrestling",

    "zero2hero-kickboxing": "Road2Champion Muay Thai",
    "z2h-kickboxing": "Road2Champion Muay Thai",
    "zero2hero-muay-thai": "Road2Champion Muay Thai",
    "z2h-muay-thai": "Road2Champion Muay Thai",

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

function labelForPreferredPlan(value = "") {
  const labels = {
    "standard-2-3":
      "Standard Plan — 2–3 days/week",
    "plus-4-6":
      "Plus Plan — 4–6 days/week"
  };

  return labels[value] || value || "—";
}

function labelForLocation(value = "") {
  const labels = {
    "santa-ynez-valley": "Santa Ynez Valley",
    lompoc: "Lompoc",
    "elk-grove": "Elk Grove"
  };
  return labels[value] || value || "—";
}

function labelForTrainingPattern(value = "") {
  const labels = {
    "monday-wednesday":
      "Monday + Wednesday",

    "tuesday-thursday":
      "Tuesday + Thursday",

    "not-sure":
      "Not sure — needs guidance"
  };

  return labels[value] || value || "—";
}

function labelForClassTime(value = "") {
  if (!value) {
    return "—";
  }

  const [hoursRaw, minutesRaw] =
    String(value).split(":");

  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return value;
  }

  const suffix =
    hours >= 12 ? "PM" : "AM";

  const displayHours =
    hours % 12 || 12;

  return (
    `${displayHours}:` +
    `${String(minutes).padStart(2, "0")} ` +
    suffix
  );
}

function updateCounts() {
  if (countAll) countAll.textContent = leads.length;
  const counts = { new: 0, waiting: 0, issue: 0 };
  leads.forEach((lead) => {
    counts[triageForLead(lead).key] += 1;
  });
  if (countNew) countNew.textContent = counts.new;
  if (countWaiting) countWaiting.textContent = counts.waiting;
  if (countIssue) countIssue.textContent = counts.issue;
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
    if (
      wantedStatus !== "all" &&
      triageForLead(lead).key !== wantedStatus
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
      const triage = triageForLead(lead);

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

            <span class="status-badge triage-${esc(triage.key)}">
              ${esc(triage.label)} · ${esc(triage.age)}
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
                ${esc(labelForLocation(lead.locationId))}
              </div>
            </div>

            <div>
              <span class="field-label">Meeting Window</span>
              <div class="field-value">
              ${esc(labelForMeetingWindow(lead.preferredMeetingWindow))}
              </div>
            </div>

            <div>
              <span class="field-label">Starting Plan</span>
              <div class="field-value">
                ${esc(
                  labelForPreferredPlan(
                    lead.preferredPlan
                  )
                )}
              </div>
            </div>

            <div>
              <span class="field-label">Regular Training Schedule</span>
              <div class="field-value">
                ${esc(
                  labelForTrainingPattern(
                    lead.preferredTrainingPattern
                  )
                )}
              </div>
            </div>

            <div>
              <span class="field-label">Preferred Class Time</span>
              <div class="field-value">
                ${esc(
                  labelForClassTime(
                    lead.preferredClassTime
                  )
                )}
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
  ${lead.contactedAt ? `
    <span class="contacted-note">Contacted ${esc(formatDate(lead.contactedAt))}</span>
  ` : `
    <button class="save-btn" type="button" data-mark-contacted="${esc(lead.id)}">
      Mark Contacted
    </button>
  `}

  <a
    class="save-btn"
    href="/connect/appointments/?leadId=${esc(lead.id)}"
  >
    Schedule Appointment
  </a>

  <button
    class="save-btn"
    type="button"
    data-walk-in-enrollment="${esc(lead.id)}"
  >
    Walk-In Enrollment
  </button>

  <button
    class="save-btn close-btn"
    type="button"
    data-close-lead="${esc(lead.id)}"
  >
    Close Lead
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

    leads = Array.from(leadMap.values())
      .filter(isActiveLead)
      .sort((a, b) => {
        const priority = { issue: 0, waiting: 1, new: 2 };
        const triageDifference =
          priority[triageForLead(a).key] - priority[triageForLead(b).key];
        return triageDifference || timestampMillis(a.createdAt) - timestampMillis(b.createdAt);
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
async function markContacted(leadId) {
  const lead = leads.find((item) => item.id === leadId);
  if (!lead || lead.contactedAt) return;

  try {
    setStatus("Marking lead contacted...");
    await updateDoc(doc(db, "interest_leads", leadId), {
      contactedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    lead.contactedAt = new Date();
    render();
    setStatus("Lead marked contacted.");
  } catch (error) {
    console.error("[leads] contact update failed:", error);
    setStatus("Unable to mark lead contacted.", true);
  }
}

async function closeLead(leadId) {
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) return;

  const confirmed = window.confirm(
    "Close this lead? It will remain available in Pipeline History."
  );
  if (!confirmed) return;

  try {
    setStatus("Closing lead...");
    const updates = {
      leadStatus: "closed",
      status: "closed",
      updatedAt: serverTimestamp()
    };
    if (!lead.closedAt) updates.closedAt = serverTimestamp();

    await updateDoc(doc(db, "interest_leads", leadId), updates);
    leads = leads.filter((item) => item.id !== leadId);
    updateCounts();
    render();
    setStatus("Lead closed and retained in Pipeline History.");
  } catch (error) {
    console.error("[leads] close failed:", error);
    setStatus("Unable to close lead.", true);
  }
}

async function walkInEnrollment(leadId) {
  const lead =
    leads.find((item) => item.id === leadId);

  if (!lead) {
    setStatus("Lead could not be found.", true);
    return;
  }

  const athleteName =
    lead.athleteName ||
    lead.participantName ||
    "This athlete";

  const confirmed =
    window.confirm(
      [
        "Start Walk-In Enrollment?",
        "",
        `${athleteName} is already in the room.`,
        "",
        "This will mark the in-person assessment as completed,",
        "bypass appointment scheduling, and move the athlete",
        "into the proposal/enrollment flow.",
        "",
        "Continue?"
      ].join("\n")
    );

  if (!confirmed) return;

  try {
    setStatus("Preparing walk-in enrollment...");

    await setDoc(
      doc(
        db,
        "admissions_appointments",
        leadId
      ),
      {
        appointmentId: leadId,
        leadId,

        participantName:
          lead.athleteName ||
          lead.participantName ||
          "",

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

        programInterest:
          lead.programInterest || "",

        intent:
          lead.intent || "",

        primaryGoal:
          lead.primaryGoal || "",

        admissionsPath:
          lead.admissionsPath || "new",

        entryMode:
          "walk_in",

        preferredLocation:
          lead.preferredLocation || "",

        locationId:
          lead.locationId || null,

        referralSource:
          lead.referralSource || "",

        leadNotes:
          lead.notes || "",

        status:
          "completed",

        appointmentStatus:
          "completed",

        assessmentStatus:
          "completed",

        appointmentOutcome:
          "completed",

        appointmentBypassed:
          true,

        bypassReason:
          "walk_in_assessment_completed",

        walkInEnrollment:
          true,

        walkInApprovedAt:
          serverTimestamp(),

        enrollmentDecision:
          "ready-to-enroll",

        admissionsStatus:
          "ready_to_enroll",

        updatedAt:
          serverTimestamp()
      },
      {
        merge: true
      }
    );

    await updateDoc(
      doc(
        db,
        "interest_leads",
        leadId
      ),
      {
        leadStatus:
          "ready_for_proposal",

        status:
          "ready_for_proposal",

        appointmentId:
          leadId,

        processedToAppointment:
          true,

        processedAt:
          serverTimestamp(),

        appointmentStatus:
          "completed",

        assessmentStatus:
          "completed",

        appointmentOutcome:
          "completed",

        appointmentBypassed:
          true,

        bypassReason:
          "walk_in_assessment_completed",

        walkInEnrollment:
          true,

        walkInApprovedAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );

window.location.href =
  `/management/pricing/?appointmentId=${encodeURIComponent(
    leadId
  )}`;
  } catch (error) {
    console.error(
      "[leads] walk-in enrollment failed:",
      error
    );

    setStatus(
      "Unable to start Walk-In Enrollment.",
      true
    );
  }
}

searchInput?.addEventListener("input", render);
statusFilter?.addEventListener("change", render);
programFilter?.addEventListener("change", render);
refreshBtn?.addEventListener("click", loadLeads);

leadList?.addEventListener("click", (event) => {

  const contactedButton =
    event.target.closest("[data-mark-contacted]");

  if (contactedButton) {
    markContacted(contactedButton.dataset.markContacted);
    return;
  }

  const walkInButton =
    event.target.closest(
      "[data-walk-in-enrollment]"
    );

  if (walkInButton) {
    walkInEnrollment(
      walkInButton.dataset.walkInEnrollment
    );
    return;
  }

  const closeButton =
    event.target.closest("[data-close-lead]");

  if (closeButton) {
    closeLead(closeButton.dataset.closeLead);
    return;
  }

});

if (
  await requireStaffSession()
) {
  await loadLeads();
}
