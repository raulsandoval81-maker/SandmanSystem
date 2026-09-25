import {
  db,
  collection,
  getDocs,
  query,
  where
} from "/assets/js/firebase-init.js";

import {
  requireManagement,
  managementLoginUrl
} from "/management/shared/guards/management-guard.js";

const historyList = document.getElementById("historyList");
const historyStatus = document.getElementById("historyStatus");
const historySearch = document.getElementById("historySearch");
const academyFilter = document.getElementById("academyFilter");
const stageFilter = document.getElementById("stageFilter");

let records = [];

function clean(value) {
  return String(value ?? "").trim();
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function formatDate(value) {
  const millis = timestampMillis(value);
  return millis ? new Date(millis).toLocaleString() : "—";
}

function labelForLocation(value = "") {
  const labels = {
    "santa-ynez-valley": "Santa Ynez Valley",
    lompoc: "Lompoc",
    "elk-grove": "Elk Grove"
  };
  return labels[value] || value || "—";
}

function labelForProgram(value = "") {
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
    "quest2mastery-mma": "Quest2Mastery MMA",
    "q2m-mma": "Quest2Mastery MMA",
    "quest2mastery-sub-grappling": "Quest2Mastery Submission Grappling",
    "quest2mastery-submission-grappling": "Quest2Mastery Submission Grappling",
    "q2m-sub-grappling": "Quest2Mastery Submission Grappling",
    fitness: "Everyday Fitness"
  };
  return labels[value] || value || "—";
}

function labelForStage(value = "") {
  const labels = {
    new: "New Lead",
    contacted: "Contacted",
    appointment_scheduled: "Appointment Scheduled",
    ready_for_proposal: "Ready for Proposal",
    ready_for_intake: "Ready for Intake",
    ready_for_enrollment: "Ready for Enrollment",
    ready_to_enroll: "Ready for Enrollment",
    "ready-to-enroll": "Ready for Enrollment",
    intake_started: "Intake Started",
    converted: "Enrolled",
    enrolled: "Enrolled",
    closed: "Closed"
  };
  return labels[value] || value.replaceAll("_", " ") || "New Lead";
}

function currentStage(record) {
  if (record.closedAt || record.leadStatus === "closed" || record.status === "closed") return "closed";
  if (record.enrolledAt) return "enrolled";
  if (record.intakeStartedAt) return "intake_started";
  if (record.walkInApprovedAt) return "ready_for_proposal";
  if (record.appointmentScheduledAt || record.appointmentStatus === "scheduled" || record.appointment?.status === "scheduled") {
    return "appointment_scheduled";
  }
  if (record.contactedAt) return "contacted";
  return clean(record.leadStatus || record.status || "new");
}

function timelineEvents(record) {
  const candidates = [
    ["createdAt", "Submitted"],
    ["contactedAt", "Contacted"],
    ["appointmentScheduledAt", "Appointment Scheduled"],
    ["walkInApprovedAt", "Walk-In Approved"],
    ["intakeStartedAt", "Enrollment / Intake Started"],
    ["enrolledAt", "Enrolled"],
    ["closedAt", "Closed"]
  ];
  const events = candidates
    .map(([field, label]) => ({ field, label, value: record[field], millis: timestampMillis(record[field]) }))
    .filter((event) => event.millis > 0);

  const processedMillis = timestampMillis(record.processedAt);
  if (processedMillis && !events.some((event) => event.millis === processedMillis)) {
    events.push({ field: "processedAt", label: "Handoff Processed", value: record.processedAt, millis: processedMillis });
  }

  return events.sort((a, b) => a.millis - b.millis);
}

function setStatus(message, isError = false) {
  historyStatus.textContent = message;
  historyStatus.classList.toggle("error", isError);
}

function populateFilters() {
  const locations = [...new Set(records.map((record) => clean(record.locationId)).filter(Boolean))].sort();
  const stages = [...new Set(records.map(currentStage).filter(Boolean))].sort();
  academyFilter.innerHTML = '<option value="all">All Academies</option>' + locations
    .map((location) => `<option value="${esc(location)}">${esc(labelForLocation(location))}</option>`)
    .join("");
  stageFilter.innerHTML = '<option value="all">All Stages</option>' + stages
    .map((stage) => `<option value="${esc(stage)}">${esc(labelForStage(stage))}</option>`)
    .join("");
}

function filteredRecords() {
  const needle = clean(historySearch.value).toLowerCase();
  const location = academyFilter.value;
  const stage = stageFilter.value;
  return records.filter((record) => {
    if (location !== "all" && record.locationId !== location) return false;
    if (stage !== "all" && currentStage(record) !== stage) return false;
    if (!needle) return true;
    return [record.id, record.athleteName, record.participantName, record.parentName, record.email, record.phone]
      .map(clean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function render() {
  const visible = filteredRecords();
  if (!visible.length) {
    historyList.innerHTML = '<div class="history-empty">No pipeline records match the current filters.</div>';
    setStatus(`0 of ${records.length} records shown.`);
    return;
  }

  historyList.innerHTML = visible.map((record) => {
    const events = timelineEvents(record);
    return `
      <article class="history-card">
        <header class="history-card__header">
          <div>
            <h2>${esc(record.athleteName || record.participantName || "Unnamed Athlete")}</h2>
            <p>${esc(record.parentName || "Parent not recorded")}</p>
          </div>
          <span class="history-stage">${esc(labelForStage(currentStage(record)))}</span>
        </header>
        <dl class="history-facts">
          <div><dt>Academy</dt><dd>${esc(labelForLocation(record.locationId))}</dd></div>
          <div><dt>Program / Journey</dt><dd>${esc(labelForProgram(record.programInterest))}</dd></div>
          <div><dt>Submitted</dt><dd>${esc(formatDate(record.createdAt))}</dd></div>
          <div><dt>Lead ID</dt><dd class="history-id">${esc(record.id)}</dd></div>
        </dl>
        <ol class="history-timeline">
          ${events.length ? events.map((event) => `
            <li><span>${esc(event.label)}</span><time>${esc(formatDate(event.value))}</time></li>
          `).join("") : '<li class="history-timeline__empty">No milestone timestamps recorded.</li>'}
        </ol>
      </article>
    `;
  }).join("");
  setStatus(`${visible.length} of ${records.length} records shown.`);
}

async function loadHistory(context) {
  const snapshots = [];
  if (context.isSystemAdmin) {
    snapshots.push(await getDocs(collection(db, "interest_leads")));
  } else {
    const locationIds = context.scope?.locationIds || [];
    if (!locationIds.length) {
      records = [];
      populateFilters();
      render();
      setStatus("No locations are assigned to this Management profile.");
      return;
    }
    for (let index = 0; index < locationIds.length; index += 10) {
      snapshots.push(await getDocs(query(
        collection(db, "interest_leads"),
        where("locationId", "in", locationIds.slice(index, index + 10))
      )));
    }
  }

  const recordMap = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((snapshotDoc) => {
    recordMap.set(snapshotDoc.id, { id: snapshotDoc.id, ...snapshotDoc.data() });
  }));
  records = [...recordMap.values()].sort(
    (a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)
  );
  populateFilters();
  render();
}

[historySearch, academyFilter, stageFilter].forEach((control) => {
  control.addEventListener(control === historySearch ? "input" : "change", render);
});

try {
  const context = await requireManagement();
  await loadHistory(context);
} catch (error) {
  console.error("[pipeline-history] load failed:", error);
  if (!error?.code || String(error.code).includes("auth")) {
    window.location.replace(managementLoginUrl());
  } else {
    setStatus("Unable to load pipeline history.", true);
  }
}
