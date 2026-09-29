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
  if (typeof value?.toDate === "function") return value.toDate().getTime();
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

function stageFromProposalStatus(status = "") {
  const key = clean(status).toUpperCase();
  if (["BUILDING", "DRAFT"].includes(key)) return "ready_for_proposal";
  if (["REVIEW", "AWAITING_CLIENT_SIGNATURE", "CLIENT_CHANGES_REQUESTED", "CLIENT_SIGNED"].includes(key)) return "proposal_review";
  if (["READY_FOR_CHECKOUT", "CHECKOUT_CREATED", "PAYMENT_PENDING"].includes(key)) return "checkout";
  if (key === "PAID") return "ready_for_enrollment";
  if (key === "VOID") return "closed";
  return "proposal";
}

function currentStage(record) {
  if (record.proposalId) return stageFromProposalStatus(record.proposalStatus);
  if (record.closedAt || record.leadStatus === "closed" || record.status === "closed") return "closed";
  if (record.enrolledAt) return "enrolled";
  if (record.intakeStartedAt) return "intake_started";
  if (record.walkInApprovedAt) return "ready_for_proposal";
  if (record.appointmentScheduledAt || record.appointmentStatus === "scheduled" || record.appointment?.status === "scheduled") return "appointment_scheduled";
  if (record.contactedAt) return "contacted";
  return clean(record.leadStatus || record.status || "new");
}

function labelForStage(value = "") {
  const labels = {
    new: "New Lead",
    contacted: "Contacted",
    appointment_scheduled: "Appointment Scheduled",
    ready_for_proposal: "Ready for Proposal",
    proposal: "Proposal",
    proposal_review: "Proposal Review",
    checkout: "Checkout",
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

function setStatus(message, isError = false) {
  historyStatus.textContent = message;
  historyStatus.classList.toggle("error", isError);
}

function leadKeys(record = {}) {
  return [
    record.id,
    record.leadId,
    record.interestLeadId,
    record.appointmentId,
    record.admissionsRequestId,
    record.requestId
  ].map(clean).filter(Boolean);
}

function proposalKeys(proposal = {}) {
  return [
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

function proposalsMatchLead(proposal, lead) {
  const leadSet = new Set(leadKeys(lead));
  return proposalKeys(proposal).some((key) => leadSet.has(key));
}

function familyNameFromProposal(proposal = {}) {
  return clean(
    proposal.prospect?.familyName ||
    proposal.prospect?.primaryContactName ||
    proposal.familyName ||
    proposal.parentName
  );
}

function athleteNameFromProposal(proposal = {}) {
  const athletes = Array.isArray(proposal.athletes) ? proposal.athletes : [];
  return clean(
    athletes[0]?.name ||
    proposal.prospect?.athleteName ||
    proposal.athleteName ||
    familyNameFromProposal(proposal) ||
    "Unnamed Case"
  );
}

function programFromProposal(proposal = {}) {
  const athletes = Array.isArray(proposal.athletes) ? proposal.athletes : [];
  const first = athletes[0] || {};
  const journey = clean(first.journey);
  const disciplines = Array.isArray(first.disciplines) ? first.disciplines : [];
  const discipline = clean(disciplines[0]);
  if (journey && discipline) return `${journey}-${discipline}`;
  return clean(proposal.programInterest || proposal.prospect?.programInterest);
}

function normalizedIdentity(value = "") {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function caseDisplayName(record = {}) {
  return clean(record.athleteName || record.participantName);
}

function canIdentityMatchProposal(caseRecord, proposal) {
  const caseName = normalizedIdentity(caseDisplayName(caseRecord));
  const proposalName = normalizedIdentity(athleteNameFromProposal(proposal));
  if (!caseName || !proposalName || caseName !== proposalName) return false;

  const caseLocation = clean(caseRecord.locationId || caseRecord.proposalLocationId);
  const proposalLocation = clean(proposal.locationId);
  if (!caseLocation || !proposalLocation || caseLocation !== proposalLocation) return false;

  const caseProgram = normalizedIdentity(caseRecord.programInterest);
  const proposalProgram = normalizedIdentity(programFromProposal(proposal));
  if (caseProgram && proposalProgram && caseProgram !== proposalProgram) return false;

  return true;
}

function proposalSortValue(proposal = {}) {
  return timestampMillis(proposal.updatedAt || proposal.createdAt);
}

function finalizeCase(caseRecord) {
  const proposalList = Array.isArray(caseRecord.proposals)
    ? [...caseRecord.proposals].sort((a, b) => proposalSortValue(b) - proposalSortValue(a))
    : [];

  const currentProposal = proposalList[0] || null;

  return {
    ...caseRecord,
    proposals: proposalList,
    proposalId: clean(currentProposal?.proposalId || currentProposal?.id || caseRecord.proposalId),
    proposalStatus: clean(currentProposal?.status || caseRecord.proposalStatus),
    proposalUpdatedAt: currentProposal?.updatedAt || currentProposal?.createdAt || caseRecord.proposalUpdatedAt || null,
    proposalLocationId: clean(currentProposal?.locationId || caseRecord.proposalLocationId)
  };
}

function buildCaseRecords(leads, proposals) {
  const orderedProposals = [...proposals].sort((a, b) => proposalSortValue(b) - proposalSortValue(a));
  const cases = leads.map((lead) => ({
    ...lead,
    source: "lead",
    proposals: []
  }));

  const unmatched = [];

  orderedProposals.forEach((proposal) => {
    const explicitMatches = cases.filter((caseRecord) =>
      proposalsMatchLead(proposal, caseRecord)
    );

    if (explicitMatches.length === 1) {
      explicitMatches[0].proposals.push(proposal);
    } else {
      unmatched.push(proposal);
    }
  });

  unmatched.forEach((proposal) => {
    const identityMatches = cases.filter((caseRecord) =>
      canIdentityMatchProposal(caseRecord, proposal)
    );

    if (identityMatches.length === 1) {
      identityMatches[0].proposals.push(proposal);
      return;
    }

    const proposalId = clean(proposal.proposalId || proposal.id);
    if (!proposalId) return;

    cases.push({
      id: `proposal:${proposalId}`,
      source: "proposal",
      proposals: [proposal],
      athleteName: athleteNameFromProposal(proposal),
      participantName: athleteNameFromProposal(proposal),
      parentName: familyNameFromProposal(proposal),
      locationId: clean(proposal.locationId),
      programInterest: programFromProposal(proposal),
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt || proposal.createdAt,
      email: clean(proposal.prospect?.email || proposal.email),
      appointmentId: clean(proposal.appointmentId || proposal.prospect?.appointmentId)
    });
  });

  return cases
    .map(finalizeCase)
    .sort((a, b) =>
      timestampMillis(b.proposalUpdatedAt || b.updatedAt || b.createdAt) -
      timestampMillis(a.proposalUpdatedAt || a.updatedAt || a.createdAt)
    );
}

function populateFilters() {
  const locations = [...new Set(records.map((record) => clean(record.locationId || record.proposalLocationId)).filter(Boolean))].sort();
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
    const recordLocation = clean(record.locationId || record.proposalLocationId);
    if (location !== "all" && recordLocation !== location) return false;
    if (stage !== "all" && currentStage(record) !== stage) return false;
    if (!needle) return true;

    const proposalSearch = (record.proposals || [])
      .map((proposal) => `${clean(proposal.proposalId || proposal.id)} ${clean(proposal.status)}`)
      .join(" ");

    return [
      record.id,
      proposalSearch,
      record.athleteName,
      record.participantName,
      record.parentName,
      record.email,
      record.phone
    ].map(clean).join(" ").toLowerCase().includes(needle);
  });
}

function resumeAction(record) {
  const proposalId = clean(record.proposalId);
  const status = clean(record.proposalStatus).toUpperCase();

  if (proposalId) {
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

  const appointmentId = clean(record.appointmentId);
  if (currentStage(record) === "ready_for_proposal" && appointmentId) {
    return {
      label: "Resume Pricing",
      href: `/management/pricing/?appointmentId=${encodeURIComponent(appointmentId)}`
    };
  }

  return null;
}

function renderEarlierProposals(record) {
  const earlier = Array.isArray(record.proposals)
    ? record.proposals.slice(1)
    : [];

  if (!earlier.length) return "";

  return `
    <details class="history-earlier-proposals">
      <summary>${earlier.length} earlier proposal${earlier.length === 1 ? "" : "s"}</summary>
      <div class="history-earlier-proposals__list">
        ${earlier.map((proposal) => {
          const proposalId = clean(proposal.proposalId || proposal.id);
          return `
            <div class="history-earlier-proposal">
              <span class="history-id">${esc(proposalId)}</span>
              <span>${esc(proposalStatusLabel(proposal.status))}</span>
              <a href="/management/pipeline-history/activity/?proposalId=${encodeURIComponent(proposalId)}">Activity</a>
            </div>
          `;
        }).join("")}
      </div>
    </details>
  `;
}

function renderActions(record) {
  const proposalId = clean(record.proposalId);
  const resume = resumeAction(record);

  if (!proposalId && !resume) return "";

  return `
    <div class="history-case-nav" aria-label="Case actions">
      ${proposalId ? `
        <a
          class="history-case-tab"
          href="/management/pipeline-history/activity/?proposalId=${encodeURIComponent(proposalId)}"
        >Open Activity</a>
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
    historyList.innerHTML = '<div class="history-empty">No pipeline cases match the current filters.</div>';
    setStatus(`0 of ${records.length} cases shown.`);
    return;
  }

  historyList.innerHTML = visible.map((record) => {
    const proposalId = clean(record.proposalId);
    const locationId = clean(record.locationId || record.proposalLocationId);
    const displayName = clean(record.athleteName || record.participantName || "Unnamed Case");
    const parentName = clean(record.parentName);
    const submitted = record.createdAt || record.updatedAt || record.proposalUpdatedAt;

    return `
      <article class="history-card">
        <header class="history-card__header">
          <div>
            <h2>${esc(displayName)}</h2>
            <p>${esc(parentName || "Family / parent not recorded")}</p>
          </div>
          <span class="history-stage">${esc(labelForStage(currentStage(record)))}</span>
        </header>

        <dl class="history-facts">
          <div><dt>Academy</dt><dd>${esc(labelForLocation(locationId))}</dd></div>
          <div><dt>Program / Journey</dt><dd>${esc(labelForProgram(record.programInterest))}</dd></div>
          <div><dt>Case Started</dt><dd>${esc(formatDate(submitted))}</dd></div>
          ${record.source === "lead" ? `<div><dt>Lead ID</dt><dd class="history-id">${esc(record.id)}</dd></div>` : ""}
          ${proposalId ? `<div><dt>Current Proposal</dt><dd class="history-id">${esc(proposalId)}</dd></div>` : ""}
          ${proposalId ? `<div><dt>Proposal Status</dt><dd>${esc(proposalStatusLabel(record.proposalStatus))}</dd></div>` : ""}
        </dl>

        ${renderEarlierProposals(record)}
        ${renderActions(record)}
      </article>
    `;
  }).join("");

  setStatus(`${visible.length} of ${records.length} cases shown.`);
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
    populateFilters();
    render();
    setStatus("No locations are assigned to this Management profile.");
    return;
  }

  const [leads, proposals] = await Promise.all([
    loadScopedCollection(context, "interest_leads"),
    loadScopedCollection(context, "proposals")
  ]);

  records = buildCaseRecords(leads, proposals);
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
