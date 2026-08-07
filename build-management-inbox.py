#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent

INBOX_DIR = ROOT / "public/management/inbox"
HTML_FILE = INBOX_DIR / "index.html"
CSS_FILE = INBOX_DIR / "inbox.css"
JS_FILE = INBOX_DIR / "inbox.js"

HUB_FILE = ROOT / "public/management/hub/index.html"
RULES_FILE = ROOT / "firestore.rules"

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


HTML = """\
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <meta
    name="robots"
    content="noindex,nofollow"
  >

  <title>
    Management Inbox | Sandman System
  </title>

  <link
    rel="stylesheet"
    href="/management/inbox/inbox.css"
  >
</head>

<body>
  <header class="inbox-header">
    <div>
      <p class="eyebrow">
        Sandman System
      </p>

      <h1>
        Management Inbox
      </h1>

      <p
        id="managementIdentity"
        class="identity"
      >
        Verifying access...
      </p>
    </div>

    <nav class="header-actions">
      <a
        class="button button-secondary"
        href="/management/hub/"
      >
        Academy Management
      </a>

      <button
        id="refreshButton"
        class="button button-secondary"
        type="button"
      >
        Refresh
      </button>

      <button
        id="signOutButton"
        class="button button-secondary"
        type="button"
      >
        Sign Out
      </button>
    </nav>
  </header>

  <main class="inbox-layout">

    <section class="queue-panel">
      <div class="panel-heading">
        <div>
          <p class="section-label">
            Operations
          </p>

          <h2>
            Management Queue
          </h2>
        </div>

        <span
          id="messageCount"
          class="count-badge"
        >
          0
        </span>
      </div>

      <div class="filters">
        <label>
          Status

          <select id="statusFilter">
            <option value="ACTIVE">
              Active Messages
            </option>

            <option value="PENDING_MANAGEMENT">
              Awaiting Manager
            </option>

            <option value="ASSIGNED">
              Coach Assigned
            </option>

            <option value="RESPONDED">
              Responded
            </option>

            <option value="CLOSED">
              Closed
            </option>

            <option value="ALL">
              All Messages
            </option>
          </select>
        </label>

        <label>
          Search

          <input
            id="messageSearch"
            type="search"
            placeholder="Name, email, topic, or message"
          >
        </label>
      </div>

      <div
        id="loadingState"
        class="state-card"
      >
        Loading Management messages...
      </div>

      <div
        id="errorState"
        class="state-card state-card--error"
        hidden
      >
        Management Inbox could not load.
      </div>

      <div
        id="emptyState"
        class="state-card"
        hidden
      >
        No messages match the current filters.
      </div>

      <div
        id="messageQueue"
        class="message-queue"
        hidden
      ></div>
    </section>

    <section class="detail-panel">
      <div
        id="detailEmpty"
        class="detail-empty"
      >
        <p class="section-label">
          Message Review
        </p>

        <h2>
          Select a Message
        </h2>

        <p>
          Choose a message from the Management
          queue to review and assign.
        </p>
      </div>

      <article
        id="messageDetail"
        hidden
      >
        <div class="detail-heading">
          <div>
            <p
              id="detailTopic"
              class="section-label"
            >
              Message
            </p>

            <h2 id="detailContactName">
              Contact
            </h2>

            <p
              id="detailSubmittedAt"
              class="muted"
            ></p>
          </div>

          <span
            id="detailStatus"
            class="status-badge"
          ></span>
        </div>

        <dl class="detail-grid">
          <div>
            <dt>Email</dt>
            <dd>
              <a id="detailEmail"></a>
            </dd>
          </div>

          <div>
            <dt>Phone</dt>
            <dd>
              <a id="detailPhone"></a>
            </dd>
          </div>

          <div>
            <dt>Organization</dt>
            <dd id="detailOrganization"></dd>
          </div>

          <div>
            <dt>Location</dt>
            <dd id="detailLocation"></dd>
          </div>

          <div>
            <dt>Routing Stage</dt>
            <dd id="detailRoutingStage"></dd>
          </div>

          <div>
            <dt>Assignment</dt>
            <dd id="detailAssignment"></dd>
          </div>
        </dl>

        <section class="message-card">
          <h3>Message</h3>
          <p id="detailMessage"></p>
        </section>

        <form id="assignmentForm">
          <input
            id="selectedMessageId"
            type="hidden"
          >

          <label>
            Assign Coach

            <select
              id="coachSelect"
              required
            >
              <option value="">
                Select an active coach
              </option>
            </select>
          </label>

          <label>
            Management Notes

            <textarea
              id="managementNotes"
              rows="5"
              maxlength="4000"
              placeholder="Add routing or follow-up notes"
            ></textarea>
          </label>

          <div class="form-actions">
            <button
              id="assignCoachButton"
              class="button button-primary"
              type="submit"
            >
              Assign Coach
            </button>
          </div>

          <p
            id="formStatus"
            class="form-status"
            aria-live="polite"
          ></p>
        </form>
      </article>
    </section>

  </main>

  <script
    type="module"
    src="/management/inbox/inbox.js"
  ></script>
</body>
</html>
"""


CSS = """\
:root {
  color-scheme: dark;
  --page: #090909;
  --panel: #111;
  --panel-soft: #171717;
  --line: rgba(255,255,255,.13);
  --muted: #aaa;
  --text: #f4f4f4;
  --gold: #d1aa55;
  --danger: #f09a9a;
  --success: #a8d9ad;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(
      circle at top,
      #202020 0,
      var(--page) 42rem
    );
  color: var(--text);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

button,
input,
select,
textarea {
  font: inherit;
}

a {
  color: inherit;
}

.inbox-header {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
  padding: 1.5rem clamp(1rem, 4vw, 3rem);
  border-bottom: 1px solid var(--line);
  background: rgba(9,9,9,.92);
  position: sticky;
  top: 0;
  z-index: 10;
}

.eyebrow,
.section-label {
  margin: 0 0 .35rem;
  color: var(--gold);
  font-size: .76rem;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: .4rem;
  font-size: clamp(1.7rem, 4vw, 2.7rem);
}

.identity,
.muted {
  margin-bottom: 0;
  color: var(--muted);
}

.header-actions,
.form-actions {
  display: flex;
  align-items: center;
  gap: .75rem;
  flex-wrap: wrap;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: .75rem 1rem;
  border-radius: .7rem;
  border: 1px solid var(--line);
  text-decoration: none;
  cursor: pointer;
}

.button-secondary {
  background: var(--panel-soft);
  color: var(--text);
}

.button-primary {
  background: var(--gold);
  border-color: var(--gold);
  color: #090909;
  font-weight: 800;
}

.button:disabled {
  opacity: .55;
  cursor: wait;
}

.inbox-layout {
  display: grid;
  grid-template-columns:
    minmax(20rem, .85fr)
    minmax(24rem, 1.15fr);
  gap: 1.25rem;
  width: min(92rem, 100%);
  margin: 0 auto;
  padding: 1.25rem;
}

.queue-panel,
.detail-panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: rgba(17,17,17,.93);
  overflow: hidden;
}

.queue-panel {
  padding: 1rem;
}

.detail-panel {
  padding: clamp(1rem, 3vw, 2rem);
}

.panel-heading,
.detail-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.count-badge,
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  padding: .35rem .65rem;
  border-radius: 999px;
  background: rgba(209,170,85,.15);
  border: 1px solid rgba(209,170,85,.4);
  color: var(--gold);
  font-size: .78rem;
  font-weight: 800;
}

.filters {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: .75rem;
  margin: 1rem 0;
}

label {
  display: grid;
  gap: .45rem;
  color: #ddd;
  font-size: .86rem;
  font-weight: 700;
}

input,
select,
textarea {
  width: 100%;
  color: var(--text);
  background: #0c0c0c;
  border: 1px solid var(--line);
  border-radius: .65rem;
  padding: .8rem .9rem;
}

textarea {
  resize: vertical;
}

.message-queue {
  display: grid;
  gap: .65rem;
}

.message-item {
  width: 100%;
  text-align: left;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: .8rem;
  color: var(--text);
  background: var(--panel-soft);
  cursor: pointer;
}

.message-item:hover,
.message-item.is-selected {
  border-color: rgba(209,170,85,.75);
  background: #1c1a15;
}

.message-item__top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: .5rem;
}

.message-item__name {
  font-weight: 800;
}

.message-item__time {
  color: var(--muted);
  font-size: .78rem;
}

.message-item__topic {
  margin-bottom: .35rem;
  color: var(--gold);
  font-size: .82rem;
  font-weight: 800;
}

.message-item__preview {
  margin-bottom: .75rem;
  color: #ddd;
  line-height: 1.45;
}

.message-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
}

.chip {
  padding: .28rem .5rem;
  border-radius: 999px;
  background: #0d0d0d;
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: .7rem;
  font-weight: 700;
}

.state-card,
.detail-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--muted);
}

.state-card--error {
  color: var(--danger);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .8rem;
  margin: 1.25rem 0;
}

.detail-grid > div,
.message-card {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: .75rem;
  background: var(--panel-soft);
}

dt {
  margin-bottom: .35rem;
  color: var(--muted);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.message-card {
  margin-bottom: 1.25rem;
}

.message-card p {
  margin-bottom: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}

#assignmentForm {
  display: grid;
  gap: 1rem;
}

.form-status {
  min-height: 1.3rem;
  margin: 0;
  color: var(--muted);
}

.form-status.is-error {
  color: var(--danger);
}

.form-status.is-success {
  color: var(--success);
}

@media (max-width: 850px) {
  .inbox-header {
    position: static;
    flex-direction: column;
  }

  .inbox-layout {
    grid-template-columns: 1fr;
  }

  .filters,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
"""


JS = """\
import {
  auth,
  db,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "/assets/js/firebase-init.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";


const managementIdentity =
  document.getElementById("managementIdentity");

const refreshButton =
  document.getElementById("refreshButton");

const signOutButton =
  document.getElementById("signOutButton");

const statusFilter =
  document.getElementById("statusFilter");

const messageSearch =
  document.getElementById("messageSearch");

const messageCount =
  document.getElementById("messageCount");

const loadingState =
  document.getElementById("loadingState");

const errorState =
  document.getElementById("errorState");

const emptyState =
  document.getElementById("emptyState");

const messageQueue =
  document.getElementById("messageQueue");

const detailEmpty =
  document.getElementById("detailEmpty");

const messageDetail =
  document.getElementById("messageDetail");

const detailTopic =
  document.getElementById("detailTopic");

const detailContactName =
  document.getElementById("detailContactName");

const detailSubmittedAt =
  document.getElementById("detailSubmittedAt");

const detailStatus =
  document.getElementById("detailStatus");

const detailEmail =
  document.getElementById("detailEmail");

const detailPhone =
  document.getElementById("detailPhone");

const detailOrganization =
  document.getElementById("detailOrganization");

const detailLocation =
  document.getElementById("detailLocation");

const detailRoutingStage =
  document.getElementById("detailRoutingStage");

const detailAssignment =
  document.getElementById("detailAssignment");

const detailMessage =
  document.getElementById("detailMessage");

const assignmentForm =
  document.getElementById("assignmentForm");

const selectedMessageId =
  document.getElementById("selectedMessageId");

const coachSelect =
  document.getElementById("coachSelect");

const managementNotes =
  document.getElementById("managementNotes");

const assignCoachButton =
  document.getElementById("assignCoachButton");

const formStatus =
  document.getElementById("formStatus");


let managementContext = null;
let allMessages = [];
let selectedMessage = null;
let coachDirectory = [];


const TOPIC_LABELS = {
  programs: "Programs",
  schedule: "Schedule",
  admissions: "Admissions",
  billing: "Billing",
  location: "Location",
  coaching: "Coaching",
  partnership: "Community / Partnership",
  other: "Other"
};


function clean(value) {
  return String(value ?? "").trim();
}


function formatDate(timestamp) {
  if (!timestamp) {
    return "Unknown date";
  }

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(date);
}


function topicLabel(value) {
  const key = clean(value);

  return TOPIC_LABELS[key] ||
    key ||
    "General Question";
}


function statusValue(message) {
  return clean(
    message.messageStatus ||
    message.status ||
    "REVIEWING"
  ).toUpperCase();
}


function assignmentValue(message) {
  return clean(
    message.assignmentStatus ||
    "PENDING_MANAGEMENT"
  ).toUpperCase();
}


function stageValue(message) {
  return clean(
    message.routingStage ||
    "MANAGEMENT_TRIAGE"
  ).toUpperCase();
}


function setLink(element, value, prefix) {
  const text = clean(value);

  if (!text) {
    element.textContent = "Not provided";
    element.removeAttribute("href");
    return;
  }

  element.textContent = text;
  element.href = `${prefix}${text}`;
}


function setFormStatus(message = "", type = "") {
  formStatus.textContent = message;

  formStatus.classList.remove(
    "is-error",
    "is-success"
  );

  if (type === "error") {
    formStatus.classList.add("is-error");
  }

  if (type === "success") {
    formStatus.classList.add("is-success");
  }
}


function activeManagementMessage(message) {
  return [
    "MANAGEMENT_TRIAGE",
    "COACH_ASSIGNED",
    "COACH_REVIEWING",
    "RESPONDED",
    "CLOSED"
  ].includes(stageValue(message));
}


function matchesFilters(message) {
  const selectedStatus =
    statusFilter.value;

  const status =
    statusValue(message);

  const assignment =
    assignmentValue(message);

  if (selectedStatus === "ACTIVE") {
    if (
      status === "CLOSED" ||
      stageValue(message) === "CLOSED"
    ) {
      return false;
    }
  } else if (
    selectedStatus === "PENDING_MANAGEMENT"
  ) {
    if (
      assignment !== "PENDING_MANAGEMENT"
    ) {
      return false;
    }
  } else if (
    selectedStatus === "ASSIGNED"
  ) {
    if (
      !clean(message.assignedCoachUid)
    ) {
      return false;
    }
  } else if (
    selectedStatus !== "ALL" &&
    status !== selectedStatus
  ) {
    return false;
  }

  const search =
    clean(messageSearch.value)
      .toLowerCase();

  if (!search) {
    return true;
  }

  const haystack = [
    message.contactName,
    message.email,
    message.phone,
    message.topic,
    message.message,
    message.organizationName,
    message.academyName,
    message.locationName
  ]
    .map((value) =>
      clean(value).toLowerCase()
    )
    .join(" ");

  return haystack.includes(search);
}


function visibleMessages() {
  return allMessages
    .filter(activeManagementMessage)
    .filter(matchesFilters);
}


function createChip(text) {
  const chip =
    document.createElement("span");

  chip.className = "chip";
  chip.textContent = text;

  return chip;
}


function createMessageItem(message) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "message-item";

  if (
    selectedMessage &&
    selectedMessage.id === message.id
  ) {
    button.classList.add("is-selected");
  }

  const top =
    document.createElement("div");

  top.className = "message-item__top";

  const name =
    document.createElement("span");

  name.className = "message-item__name";

  name.textContent =
    clean(message.contactName) ||
    "Unknown Contact";

  const time =
    document.createElement("span");

  time.className = "message-item__time";
  time.textContent = formatDate(message.createdAt);

  const topic =
    document.createElement("p");

  topic.className = "message-item__topic";
  topic.textContent = topicLabel(message.topic);

  const preview =
    document.createElement("p");

  preview.className = "message-item__preview";

  preview.textContent =
    clean(message.message) ||
    "No message provided.";

  const meta =
    document.createElement("div");

  meta.className = "message-item__meta";

  meta.append(
    createChip(stageValue(message)),
    createChip(
      clean(message.locationName) ||
      clean(message.locationId) ||
      "No location"
    ),
    createChip(assignmentValue(message))
  );

  top.append(name, time);

  button.append(
    top,
    topic,
    preview,
    meta
  );

  button.addEventListener(
    "click",
    () => selectMessage(message.id)
  );

  return button;
}


function renderQueue() {
  const messages = visibleMessages();

  messageQueue.replaceChildren();

  messageCount.textContent =
    String(messages.length);

  loadingState.hidden = true;
  errorState.hidden = true;

  if (!messages.length) {
    emptyState.hidden = false;
    messageQueue.hidden = true;
    return;
  }

  emptyState.hidden = true;
  messageQueue.hidden = false;

  const fragment =
    document.createDocumentFragment();

  for (const message of messages) {
    fragment.appendChild(
      createMessageItem(message)
    );
  }

  messageQueue.appendChild(fragment);
}


function selectMessage(messageId) {
  selectedMessage =
    allMessages.find(
      (message) => message.id === messageId
    ) || null;

  renderQueue();
  renderDetail();
}


function populateCoachSelect(message) {
  coachSelect.replaceChildren();

  const placeholder =
    document.createElement("option");

  placeholder.value = "";
  placeholder.textContent =
    "Select an active coach";

  coachSelect.appendChild(placeholder);

  for (const coach of coachDirectory) {
    const option =
      document.createElement("option");

    option.value = coach.id;

    const name = clean(
      coach.fullName ||
      coach.displayName ||
      coach.email ||
      coach.id
    );

    const email = clean(coach.email);

    option.textContent =
      email && email !== name
        ? `${name} — ${email}`
        : name;

    coachSelect.appendChild(option);
  }

  const assignedCoach =
    clean(message.assignedCoachUid);

  if (
    assignedCoach &&
    coachDirectory.some(
      (coach) => coach.id === assignedCoach
    )
  ) {
    coachSelect.value = assignedCoach;
  }
}


function renderDetail() {
  if (!selectedMessage) {
    detailEmpty.hidden = false;
    messageDetail.hidden = true;
    return;
  }

  detailEmpty.hidden = true;
  messageDetail.hidden = false;

  const message = selectedMessage;

  selectedMessageId.value = message.id;

  detailTopic.textContent =
    topicLabel(message.topic);

  detailContactName.textContent =
    clean(message.contactName) ||
    "Unknown Contact";

  detailSubmittedAt.textContent =
    `Submitted ${formatDate(message.createdAt)}`;

  detailStatus.textContent =
    assignmentValue(message);

  setLink(
    detailEmail,
    message.email,
    "mailto:"
  );

  setLink(
    detailPhone,
    message.phone,
    "tel:"
  );

  detailOrganization.textContent =
    clean(message.organizationName) ||
    clean(message.academyName) ||
    clean(message.organizationId) ||
    "Not assigned";

  detailLocation.textContent =
    clean(message.locationName) ||
    clean(message.locationId) ||
    "Not assigned";

  detailRoutingStage.textContent =
    stageValue(message);

  detailAssignment.textContent =
    assignmentValue(message);

  detailMessage.textContent =
    clean(message.message) ||
    "No message provided.";

  managementNotes.value =
    clean(message.managementNotes);

  populateCoachSelect(message);

  setFormStatus("");
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
        a.email ||
        a.id
      ).localeCompare(
        clean(
          b.fullName ||
          b.email ||
          b.id
        )
      )
    );
}


async function loadMessagesForAdmin() {
  const snapshot = await getDocs(
    query(
      collection(db, "general_messages"),
      orderBy("createdAt", "desc")
    )
  );

  return snapshot.docs.map(
    (messageDoc) => ({
      id: messageDoc.id,
      ...messageDoc.data()
    })
  );
}


async function loadMessagesForManager() {
  const snapshots = [];

  const assignedSnapshot = await getDocs(
    query(
      collection(db, "general_messages"),
      where(
        "assignedManagerUid",
        "==",
        managementContext.user.uid
      )
    )
  );

  snapshots.push(assignedSnapshot);

  const locationIds =
    managementContext.scope.locationIds;

  if (locationIds.length) {
    const queueSnapshot = await getDocs(
      query(
        collection(db, "general_messages"),
        where(
          "locationId",
          "in",
          locationIds.slice(0, 10)
        ),
        where(
          "assignmentStatus",
          "==",
          "PENDING_MANAGEMENT"
        )
      )
    );

    snapshots.push(queueSnapshot);
  }

  const messages = new Map();

  for (const snapshot of snapshots) {
    for (const messageDoc of snapshot.docs) {
      messages.set(
        messageDoc.id,
        {
          id: messageDoc.id,
          ...messageDoc.data()
        }
      );
    }
  }

  return Array.from(messages.values())
    .sort((a, b) => {
      const aSeconds =
        a.createdAt?.seconds || 0;

      const bSeconds =
        b.createdAt?.seconds || 0;

      return bSeconds - aSeconds;
    });
}


async function loadInbox() {
  refreshButton.disabled = true;

  loadingState.hidden = false;
  errorState.hidden = true;
  emptyState.hidden = true;
  messageQueue.hidden = true;

  try {
    managementContext =
      await requireManagement();

    managementIdentity.textContent =
      `${
        clean(
          managementContext.staff.fullName
        ) ||
        managementContext.user.email ||
        "Management"
      } — ${
        managementContext.isSystemAdmin
          ? "System Admin Oversight"
          : "Operational Management"
      }`;

    await loadCoachDirectory();

    allMessages =
      managementContext.isSystemAdmin
        ? await loadMessagesForAdmin()
        : await loadMessagesForManager();

    if (selectedMessage) {
      selectedMessage =
        allMessages.find(
          (message) =>
            message.id === selectedMessage.id
        ) || null;
    }

    renderQueue();
    renderDetail();

  } catch (error) {
    console.error(
      "[management-inbox] load failed:",
      error
    );

    loadingState.hidden = true;
    messageQueue.hidden = true;
    emptyState.hidden = true;
    errorState.hidden = false;
  } finally {
    refreshButton.disabled = false;
  }
}


async function assignCoach(event) {
  event.preventDefault();

  if (
    !selectedMessage ||
    !managementContext
  ) {
    setFormStatus(
      "Select a message first.",
      "error"
    );
    return;
  }

  const coachUid =
    clean(coachSelect.value);

  if (!coachUid) {
    setFormStatus(
      "Select an active coach.",
      "error"
    );
    return;
  }

  assignCoachButton.disabled = true;
  setFormStatus("Assigning coach...");

  try {
    const updates = {
      assignedManagerUid:
        managementContext.user.uid,

      assignedCoachUid:
        coachUid,

      routingStage:
        "COACH_ASSIGNED",

      nextRoutingStage:
        "COACH_REVIEWING",

      assignmentStatus:
        "ASSIGNED",

      status:
        "ASSIGNED",

      messageStatus:
        "ASSIGNED",

      managementNotes:
        clean(managementNotes.value),

      updatedAt:
        serverTimestamp()
    };

    await updateDoc(
      doc(
        db,
        "general_messages",
        selectedMessage.id
      ),
      updates
    );

    Object.assign(
      selectedMessage,
      updates
    );

    renderQueue();
    renderDetail();

    setFormStatus(
      "Message assigned to the selected coach.",
      "success"
    );

  } catch (error) {
    console.error(
      "[management-inbox] assignment failed:",
      error
    );

    setFormStatus(
      "Coach assignment could not be saved.",
      "error"
    );
  } finally {
    assignCoachButton.disabled = false;
  }
}


statusFilter.addEventListener(
  "change",
  renderQueue
);

messageSearch.addEventListener(
  "input",
  renderQueue
);

refreshButton.addEventListener(
  "click",
  () => {
    void loadInbox();
  }
);

assignmentForm.addEventListener(
  "submit",
  (event) => {
    void assignCoach(event);
  }
);

signOutButton.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "/login/"
    );
  }
);


void loadInbox();
"""


def backup(path: Path) -> None:
    if not path.exists():
        return

    content = path.read_text(
        encoding="utf-8"
    )

    if not content.strip():
        return

    backup_path = path.with_name(
        f"{path.name}.before-management-inbox-{STAMP}"
    )

    backup_path.write_text(
        content,
        encoding="utf-8"
    )

    print(
        f"✓ Backup: {backup_path.relative_to(ROOT)}"
    )


def write_files() -> None:
    INBOX_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    for path, content in [
        (HTML_FILE, HTML),
        (CSS_FILE, CSS),
        (JS_FILE, JS),
    ]:
        backup(path)

        path.write_text(
            content,
            encoding="utf-8"
        )

        print(
            f"✅ Written: {path.relative_to(ROOT)}"
        )


def patch_hub() -> None:
    text = HUB_FILE.read_text(
        encoding="utf-8"
    )

    if 'href="/management/inbox/"' in text:
        print(
            "✓ Academy Management Inbox link already exists"
        )
        return

    marker = """\
    <section class="management-grid">
"""

    card = """\
    <section class="management-grid">

      <a
        class="management-card"
        href="/management/inbox/"
      >
        <span class="card-label">
          Operations
        </span>

        <h2>
          Inbox
        </h2>

        <p>
          Review messages routed from System
          Administration and assign the appropriate coach.
        </p>
      </a>
"""

    if marker not in text:
        raise RuntimeError(
            "Could not locate Management Hub card grid."
        )

    backup(HUB_FILE)

    HUB_FILE.write_text(
        text.replace(
            marker,
            card,
            1
        ),
        encoding="utf-8"
    )

    print(
        "✅ Added Inbox card to Academy Management"
    )


def patch_staff_rule(text: str) -> str:
    old = """\
      allow list: if isAdmin();
      allow create, update, delete: if isAdmin();
"""

    new = """\
      allow list: if isAdminOrManagement();
      allow create, update, delete: if isAdmin();
"""

    if new in text:
        return text

    if old not in text:
        raise RuntimeError(
            "Could not locate the staff list rule."
        )

    return text.replace(old, new, 1)


def patch_message_rules(text: str) -> str:
    if "Management Inbox access and coach assignment" in text:
        return text

    marker = """\
      /*
       * Current coach receiver behavior.
"""

    management_rule = """\
      /*
       * Management Inbox access and coach assignment.
       *
       * System Admin retains full Reception oversight.
       * Operational Management sees messages assigned
       * to them or pending within their location scope.
       */
      allow get, list: if isManagement()
        && (
          resource.data.assignedManagerUid ==
            request.auth.uid
          ||
          (
            resource.data.assignedManagerUid == null
            && resource.data.assignmentStatus ==
              "PENDING_MANAGEMENT"
            && managementHasLocation(
              resource.data.locationId
            )
          )
        );

      allow update: if isManagement()

        && (
          resource.data.assignedManagerUid ==
            request.auth.uid
          ||
          (
            resource.data.assignedManagerUid == null
            && resource.data.assignmentStatus ==
              "PENDING_MANAGEMENT"
            && managementHasLocation(
              resource.data.locationId
            )
          )
        )

        && request.resource.data
          .diff(resource.data)
          .changedKeys()
          .hasOnly([
            "assignedManagerUid",
            "assignedCoachUid",
            "routingStage",
            "nextRoutingStage",
            "assignmentStatus",
            "status",
            "messageStatus",
            "managementNotes",
            "updatedAt"
          ])

        && request.resource.data.assignedManagerUid ==
          request.auth.uid

        && request.resource.data.assignedCoachUid
          is string

        && request.resource.data.assignedCoachUid
          .size() > 0

        && request.resource.data.routingStage ==
          "COACH_ASSIGNED"

        && request.resource.data.nextRoutingStage ==
          "COACH_REVIEWING"

        && request.resource.data.assignmentStatus ==
          "ASSIGNED"

        && request.resource.data.status ==
          "ASSIGNED"

        && request.resource.data.messageStatus ==
          "ASSIGNED"

        && request.resource.data.managementNotes
          is string

        && request.resource.data.managementNotes
          .size() <= 4000

        && request.resource.data.updatedAt
          is timestamp;

      /*
       * Current coach receiver behavior.
"""

    if marker not in text:
        raise RuntimeError(
            "Could not locate the coach receiver rule."
        )

    return text.replace(
        marker,
        management_rule,
        1
    )


def patch_helpers(text: str) -> str:
    if "function managementHasLocation" in text:
        return text

    marker = """\
    function isOperationalStaff() {
      return staffRole() in [
        "admin",
        "management",
        "manager",
        "location_manager",
        "coach"
      ];
    }
"""

    helper = marker + """\

    function managementHasLocation(locationId) {
      return isManagement()
        && locationId is string
        && (
          (
            get(
              /databases/$(database)/documents/staff/$(request.auth.uid)
            ).data.locationIds is list
            && locationId in get(
              /databases/$(database)/documents/staff/$(request.auth.uid)
            ).data.locationIds
          )
          ||
          (
            get(
              /databases/$(database)/documents/staff/$(request.auth.uid)
            ).data.locationId is string
            && get(
              /databases/$(database)/documents/staff/$(request.auth.uid)
            ).data.locationId == locationId
          )
        );
    }
"""

    if marker not in text:
        raise RuntimeError(
            "Could not locate operational staff helper."
        )

    return text.replace(
        marker,
        helper,
        1
    )


def patch_rules() -> None:
    text = RULES_FILE.read_text(
        encoding="utf-8"
    )

    original = text

    text = patch_staff_rule(text)
    text = patch_message_rules(text)
    text = patch_helpers(text)

    if text == original:
        print(
            "✓ Firestore Inbox rules already installed"
        )
        return

    backup(RULES_FILE)

    RULES_FILE.write_text(
        text,
        encoding="utf-8"
    )

    print(
        "✅ Added Management Inbox Firestore rules"
    )


def main() -> int:
    try:
        write_files()
        patch_hub()
        patch_rules()

    except Exception as error:
        print(
            f"❌ {error}",
            file=sys.stderr
        )
        return 1

    print()
    print(
        "✅ Management Inbox installation complete."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
