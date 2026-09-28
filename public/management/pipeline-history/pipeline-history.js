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
let proposals = [];
let proposalsById = new Map();

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

function proposalStatusLabel(value = "") {
  const key = clean(value).toUpperCase();
  return ({
    BUILDING: "Building",
    DRAFT: "Draft",
    REVIEW: "Needs Review",
    AWAITING_CLIENT_SIGNATURE: "Awaiting Client Signature",
    CLIENT_CHANGES_REQUESTED: "Client Changes Requested",
    CLIENT_SIGNED: "Client Signed",
    READY_FOR_CHECKOUT: "Checkout Ready",
    CHECKOUT_CREATED: "Checkout Created",
    PAYMENT_PENDING: "Payment Pending",
    PAID: "Paid",
    VOID: "Void"
  })[key] || key.replaceAll("_", " ") || "—";
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

function proposalKeys(proposal = {}) {
  return [
    proposal.proposalId,
    proposal.id,
    proposal.leadId,
    proposal.interestLeadId,
    proposal.appointmentId,
    proposal.admissionsRequestId,
    proposal.prospect?.leadId,
    proposal.prospect?.interestLeadId,
    proposal.prospect?.appointmentId,
    proposal.prospect?.admissionsRequestId
  ].map(clean).filter(Boolean);
}

function recordKeys(record = {}) {
  return [
    record.proposalId,
    record.id,
    record.leadId,
    record.interestLeadId,
    record.appointmentId,
    record.admissionsRequestId,
    record.requestId
  ].map(clean).filter(Boolean);
}

function findProposal(record) {
  const directId = clean(record.proposalId);
  if (directId && proposalsById.has(directId)) {
    return proposalsById.get(directId);
  }

  const recordKeySet = new Set(recordKeys(record));
  if (!recordKeySet.size) return null;

  return proposals.find((proposal) =>
    proposalKeys(proposal).some((key) => recordKeySet.has(key))
  ) || null;
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

function resumeAction(record, proposal) {
  if (proposal) {
    const proposalId = clean(proposal.proposalId || proposal.id);
    const status = clean(proposal.status).toUpperCase();

    if (["BUILDING", "DRAFT"].includes(status)) {
      return {
        label: "Resume Pricing",
        href: `/connect/admissions/calculator/?proposalId=${encodeURIComponent(proposalId)}`
      };
    }

    if (status === "PAID") {
      return {
        label: "Continue Enrollment",
        href: `/intake-management/?proposalId=${encodeURIComponent(proposalId)}`
      };
    }

    if (status && status !== "VOID") {
      return {
        label: "Open Proposal",
        href: `/connect/proposals/?proposalId=${encodeURIComponent(proposalId)}`
      };
    }
  }

  const stage = currentStage(record);
  const appointmentId = clean(record.appointmentId);
  if (stage === "ready_for_proposal" && appointmentId) {
    return {
      label: "Resume Pricing",
      href: `/management/pricing/?appointmentId=${encodeURIComponent(appointmentId)}`
    };
  }

  return null;
}

function renderCaseNavigation(record) {
  const proposal = findProposal(record);
  const proposalId = clean(proposal?.proposalId || proposal?.id || record.proposalId);
  const resume = resumeAction(record, proposal);

  if (!proposalId && !resume) return "";

  return `
    <div class="history-case-nav" aria-label="Case navigation">
      <span class="history-case-tab is-current">History</span>
      ${proposalId ? `
        <a
          class="history-case-tab"
          href="/management/pipeline-history/activity/?proposalId=${encodeURIComponent(proposalId)}&leadId=${encodeURIComponent(record.id)}"
        >Activity</a>
      ` : ""}
      ${resume ? `
        <a class="history-resume-btn" href="${esc(resume.href)}">${esc(resume.label)}</a>
      ` : ""}
    </div>
  `;
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
    const proposal = findProposal(record);
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
          ${proposal ? `<div><dt>Proposal</dt><dd class="history-id">${esc(proposal.proposalId || proposal.id)}</dd></div>` : ""}
          ${proposal ? `<div><dt>Proposal Status</dt><dd>${esc(proposalStatusLabel(proposal.status))}</dd></div>` : ""}
        </dl>
        <ol class="history-timeline">
          ${events.length ? events.map((event) => `
            <li><span>${esc(event.label)}</span><time>${esc(formatDate(event.value))}</time></li>
          `).join("") : '<li class="history-timeline__empty">No milestone timestamps recorded.</li>'}
        </ol>
        ${renderCaseNavigation(record)}
      </article>
    `;
  }).join("");
  setStatus(`${visible.length} of ${records.length} records shown.`);
}

async function loadScopedCollection(context, collectionName) {
  const snapshots = [];
  if (context.isSystemAdmin) {
    snapshots.push(await getDocs(collection(db, collectionName)));
  } else {
    const locationIds = context.scope?.locationIds || [];
    if (!locationIds.length) return [];

    for (let index = 0; index < locationIds.length; index += 10) {
      snapshots.push(await getDocs(query(
        collection(db, collectionName),
        where("locationId", "in", locationIds.slice(index, index + 10))
      )));
    }
  }

  const recordMap = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((snapshotDoc) => {
    recordMap.set(snapshotDoc.id, { id: snapshotDoc.id, ...snapshotDoc.data() });
  }));
  return [...recordMap.values()];
}

async function loadHistory(context) {
  const locationIds = context.scope?.locationIds || [];
  if (!context.isSystemAdmin && !locationIds.length) {
    records = [];
    proposals = [];
    proposalsById = new Map();
    populateFilters();
    render();
    setStatus("No locations are assigned to this Management profile.");
    return;
  }

  const [leadRecords, proposalRecords] = await Promise.all([
    loadScopedCollection(context, "interest_leads"),
    loadScopedCollection(context, "proposals")
  ]);

  records = leadRecords.sort(
    (a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)
  );

  proposals = proposalRecords.sort(
    (a, b) => timestampMillis(b.updatedAt || b.createdAt) - timestampMillis(a.updatedAt || a.createdAt)
  );
  proposalsById = new Map(
    proposals.map((proposal) => [clean(proposal.proposalId || proposal.id), proposal])
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
