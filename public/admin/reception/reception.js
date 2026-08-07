import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

import {
  requireAdmin
} from "/assets/js/admin-guard.js";


/* =========================================================
   DOM
========================================================= */

const refreshButton =
  document.getElementById("refreshMessagesButton");

const statusFilter =
  document.getElementById("statusFilter");

const topicFilter =
  document.getElementById("topicFilter");

const organizationFilter =
  document.getElementById("organizationFilter");

const locationFilter =
  document.getElementById("locationFilter");

const messageSearch =
  document.getElementById("messageSearch");

const newMessageCount =
  document.getElementById("newMessageCount");

const needsRoutingCount =
  document.getElementById("needsRoutingCount");

const assignedMessageCount =
  document.getElementById("assignedMessageCount");

const waitingMessageCount =
  document.getElementById("waitingMessageCount");

const closedMessageCount =
  document.getElementById("closedMessageCount");

const visibleMessageCount =
  document.getElementById("visibleMessageCount");

const loadingState =
  document.getElementById("receptionLoadingState");

const emptyState =
  document.getElementById("receptionEmptyState");

const errorState =
  document.getElementById("receptionErrorState");

const messageQueue =
  document.getElementById("messageQueue");

const detailEmpty =
  document.getElementById("messageDetailEmpty");

const messageDetail =
  document.getElementById("messageDetail");

const detailTopic =
  document.getElementById("detailTopic");

const detailContactName =
  document.getElementById("detailContactName");

const detailSubmittedAt =
  document.getElementById("detailSubmittedAt");

const detailStatusBadge =
  document.getElementById("detailStatusBadge");

const detailEmail =
  document.getElementById("detailEmail");

const detailPhone =
  document.getElementById("detailPhone");

const detailPreferredOrganization =
  document.getElementById("detailPreferredOrganization");

const detailPreferredLocation =
  document.getElementById("detailPreferredLocation");

const detailLanguage =
  document.getElementById("detailLanguage");

const detailSource =
  document.getElementById("detailSource");

const detailMessage =
  document.getElementById("detailMessage");

const routingForm =
  document.getElementById("routingForm");

const selectedMessageId =
  document.getElementById("selectedMessageId");

const routingOrganization =
  document.getElementById("routingOrganization");

const routingLocation =
  document.getElementById("routingLocation");

const routingManager =
  document.getElementById("routingManager");

const routingPriority =
  document.getElementById("routingPriority");

const managementNotes =
  document.getElementById("managementNotes");

const routeMessageButton =
  document.getElementById("routeMessageButton");

const markRespondedButton =
  document.getElementById("markRespondedButton");

const closeMessageButton =
  document.getElementById("closeMessageButton");

const routingFormStatus =
  document.getElementById("routingFormStatus");


/* =========================================================
   STATE
========================================================= */

let adminUser = null;
let allMessages = [];
let selectedMessage = null;
let managerDirectory = [];


/* =========================================================
   LABELS
========================================================= */

const TOPIC_LABELS = {
  programs: "Programs",
  schedule: "Schedule",
  admissions: "Admissions",
  billing: "Billing",
  location: "Location",
  coaching: "Coaching / Professional Development",
  promotions: "Promotions",
  "clinics-near-me": "Clinics Near Me",
  "traveling-clinic": "Traveling Clinic Request",
  partnership: "Community / Partnership",
  other: "Other"
};

const ORGANIZATION_LABELS = {
  "sandman-academy": "Sandman Academy",
  yesc: "Youth Empowered Sports Club",
  "other-organization": "Other Organization",
  "not-sure": "Not Sure"
};

const LOCATION_LABELS = {
  solvang: "Solvang",
  lompoc: "Lompoc",
  "system-team": "System Team",
  "not-sure": "Not Sure"
};


/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}

function messageStatus(message) {
  return clean(
    message.messageStatus ||
    message.status ||
    "NEW"
  ).toUpperCase();
}

function routingStage(message) {
  return clean(
    message.routingStage ||
    "ADMIN_REVIEW"
  ).toUpperCase();
}

function assignmentStatus(message) {
  return clean(
    message.assignmentStatus ||
    "UNASSIGNED"
  ).toUpperCase();
}

function topicLabel(value) {
  const topic = clean(value);
  return TOPIC_LABELS[topic] || "General Question";
}

function organizationLabel(value) {
  const key = clean(value);
  return ORGANIZATION_LABELS[key] || key || "Not provided";
}

function locationLabel(value) {
  const key = clean(value);
  return LOCATION_LABELS[key] || key || "Not provided";
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function timestampSeconds(timestamp) {
  if (!timestamp) return 0;

  if (typeof timestamp.seconds === "number") {
    return timestamp.seconds;
  }

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? 0
    : Math.floor(date.getTime() / 1000);
}

function setContactLink(anchor, value, prefix) {
  const text = clean(value);

  if (!text) {
    anchor.textContent = "Not provided";
    anchor.removeAttribute("href");
    return;
  }

  anchor.textContent = text;
  anchor.href = `${prefix}${text}`;
}

function setFormStatus(message, type = "") {
  routingFormStatus.textContent = message;
  routingFormStatus.classList.remove(
    "is-success",
    "is-error"
  );

  if (type === "success") {
    routingFormStatus.classList.add("is-success");
  }

  if (type === "error") {
    routingFormStatus.classList.add("is-error");
  }
}

function setActionButtonsDisabled(disabled) {
  routeMessageButton.disabled = disabled;
  markRespondedButton.disabled = disabled;
  closeMessageButton.disabled = disabled;
}

function escapeText(value) {
  return clean(value);
}

function messageOrganizationKey(message) {
  return clean(
    message.organizationId ||
    message.academyId ||
    message.preferredOrganization
  );
}

function messageLocationKey(message) {
  return clean(
    message.locationId ||
    message.preferredLocation
  );
}


/* =========================================================
   SUMMARY
========================================================= */

function updateSummary() {
  const counts = {
    new: 0,
    needsRouting: 0,
    assigned: 0,
    waiting: 0,
    closed: 0
  };

  for (const message of allMessages) {
    const status = messageStatus(message);
    const stage = routingStage(message);
    const assignment = assignmentStatus(message);

    if (
      status === "CLOSED" ||
      stage === "CLOSED" ||
      message.closedAt
    ) {
      counts.closed += 1;
      continue;
    }

    if (
      status === "WAITING" ||
      status === "WAITING_FOR_RESPONSE"
    ) {
      counts.waiting += 1;
    }

    /*
     * New means the message is still waiting for
     * System Admin review.
     */
    if (stage === "ADMIN_REVIEW") {
      counts.new += 1;
    }

    /*
     * Needs Routing means Admin has not yet selected
     * both an organization and a location.
     *
     * MANAGEMENT_TRIAGE is no longer counted here,
     * because that message has already been routed.
     */
    if (
      !clean(message.organizationId) ||
      !clean(message.locationId)
    ) {
      counts.needsRouting += 1;
    }

    /*
     * Assigned means a specific manager UID exists.
     * Merely entering MANAGEMENT_TRIAGE does not mean
     * a manager has been assigned yet.
     */
    if (
      assignment === "ASSIGNED" &&
      Boolean(clean(message.assignedManagerUid))
    ) {
      counts.assigned += 1;
    }
  }

  newMessageCount.textContent =
    String(counts.new);

  needsRoutingCount.textContent =
    String(counts.needsRouting);

  assignedMessageCount.textContent =
    String(counts.assigned);

  waitingMessageCount.textContent =
    String(counts.waiting);

  closedMessageCount.textContent =
    String(counts.closed);
}


/* =========================================================
   FILTERING
========================================================= */

function matchesStatusFilter(message) {
  const selected = statusFilter.value;
  const status = messageStatus(message);
  const stage = routingStage(message);
  const assignment = assignmentStatus(message);

  if (selected === "ALL") return true;

  if (selected === "ACTIVE") {
    return status !== "CLOSED";
  }

  if (selected === "ADMIN_REVIEW") {
    return stage === "ADMIN_REVIEW" || status === "NEW";
  }

  if (selected === "MANAGEMENT_TRIAGE") {
    return (
      stage === "MANAGEMENT_TRIAGE" ||
      assignment === "NEEDS_MANAGER"
    );
  }

  if (selected === "ASSIGNED") {
    return (
      assignment === "ASSIGNED" ||
      Boolean(clean(message.assignedManagerUid))
    );
  }

  if (selected === "WAITING") {
    return (
      status === "WAITING" ||
      status === "WAITING_FOR_RESPONSE"
    );
  }

  return status === selected;
}

function matchesTopicFilter(message) {
  const selected = topicFilter.value;

  if (selected === "ALL") return true;

  return clean(message.topic) === selected;
}

function matchesOrganizationFilter(message) {
  const selected = organizationFilter.value;

  if (selected === "ALL") return true;

  const value = messageOrganizationKey(message);

  if (selected === "UNASSIGNED") {
    return !clean(message.organizationId) &&
      !clean(message.academyId);
  }

  return value === selected;
}

function matchesLocationFilter(message) {
  const selected = locationFilter.value;

  if (selected === "ALL") return true;

  const value = messageLocationKey(message);

  if (selected === "UNASSIGNED") {
    return !clean(message.locationId);
  }

  return value === selected;
}

function matchesSearch(message) {
  const term = clean(messageSearch.value).toLowerCase();

  if (!term) return true;

  const haystack = [
    message.contactName,
    message.email,
    message.phone,
    message.topic,
    message.message,
    message.preferredOrganization,
    message.preferredLocation,
    message.organizationName,
    message.academyName,
    message.locationName
  ]
    .map((value) => clean(value).toLowerCase())
    .join(" ");

  return haystack.includes(term);
}

function getVisibleMessages() {
  return allMessages
    .filter(matchesStatusFilter)
    .filter(matchesTopicFilter)
    .filter(matchesOrganizationFilter)
    .filter(matchesLocationFilter)
    .filter(matchesSearch)
    .sort((a, b) => {
      const stageOrder = {
        ADMIN_REVIEW: 0,
        MANAGEMENT_TRIAGE: 1,
        LOCATION_MANAGER: 2,
        COACH_REVIEW: 3,
        CLOSED: 4
      };

      const stageA =
        stageOrder[routingStage(a)] ?? 99;

      const stageB =
        stageOrder[routingStage(b)] ?? 99;

      if (stageA !== stageB) {
        return stageA - stageB;
      }

      return (
        timestampSeconds(b.createdAt) -
        timestampSeconds(a.createdAt)
      );
    });
}


/* =========================================================
   QUEUE
========================================================= */

function createChip(text) {
  const chip = document.createElement("span");
  chip.className = "reception-message-card__chip";
  chip.textContent = text;
  return chip;
}

function createMessageCard(message) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "reception-message-card";
  button.dataset.messageId = message.id;

  if (
    selectedMessage &&
    selectedMessage.id === message.id
  ) {
    button.classList.add("is-selected");
  }

  const topLine = document.createElement("div");
  topLine.className =
    "reception-message-card__topline";

  const name = document.createElement("span");
  name.className =
    "reception-message-card__name";

  name.textContent =
    clean(message.contactName) ||
    "Unknown Contact";

  const time = document.createElement("span");
  time.className =
    "reception-message-card__time";

  time.textContent =
    formatDate(message.createdAt);

  const topic = document.createElement("p");
  topic.className =
    "reception-message-card__topic";

  topic.textContent =
    topicLabel(message.topic);

  const preview = document.createElement("p");
  preview.className =
    "reception-message-card__preview";

  preview.textContent =
    escapeText(message.message) ||
    "No message provided.";

  const meta = document.createElement("div");
  meta.className =
    "reception-message-card__meta";

  meta.appendChild(
    createChip(routingStage(message))
  );

  meta.appendChild(
    createChip(
      organizationLabel(
        messageOrganizationKey(message)
      )
    )
  );

  meta.appendChild(
    createChip(
      locationLabel(
        messageLocationKey(message)
      )
    )
  );

  topLine.append(name, time);
  button.append(topLine, topic, preview, meta);

  button.addEventListener("click", () => {
    selectMessage(message.id);
  });

  return button;
}

function renderQueue() {
  const messages = getVisibleMessages();

  messageQueue.replaceChildren();

  visibleMessageCount.textContent =
    String(messages.length);

  loadingState.hidden = true;
  errorState.hidden = true;

  if (messages.length === 0) {
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
      createMessageCard(message)
    );
  }

  messageQueue.appendChild(fragment);
}


/* =========================================================
   DETAIL
========================================================= */

function selectMessage(messageId) {
  selectedMessage =
    allMessages.find(
      (message) => message.id === messageId
    ) || null;

  renderQueue();
  renderDetail();
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

  detailStatusBadge.textContent =
    routingStage(message);

  setContactLink(
    detailEmail,
    message.email,
    "mailto:"
  );

  setContactLink(
    detailPhone,
    message.phone,
    "tel:"
  );

  detailPreferredOrganization.textContent =
    organizationLabel(
      message.preferredOrganization
    );

  detailPreferredLocation.textContent =
    locationLabel(
      message.preferredLocation
    );

  detailLanguage.textContent =
    clean(message.language).toLowerCase() === "es"
      ? "Spanish"
      : "English";

  detailSource.textContent =
    clean(message.source) ||
    "Unknown";

  detailMessage.textContent =
    clean(message.message) ||
    "No message provided.";

  routingOrganization.value =
    clean(
      message.organizationId ||
      message.academyId
    );

  routingLocation.value =
    clean(message.locationId);

  managementNotes.value =
    clean(message.managementNotes);

  routingPriority.value =
    clean(message.priority) || "NORMAL";

  prepareManagerField(message);
  setFormStatus("");
}

async function loadManagerDirectory() {
  const snapshot = await getDocs(
    collection(db, "staff")
  );

  managerDirectory = snapshot.docs
    .map((staffDoc) => ({
      id: staffDoc.id,
      ...staffDoc.data()
    }))
    .filter((staff) => {
      const role = clean(staff.role).toLowerCase();
      const status = clean(staff.status).toLowerCase();

      return (
        status === "active" &&
        [
          "management",
          "manager",
          "location_manager"
        ].includes(role)
      );
    })
    .sort((a, b) => {
      const nameA = clean(
        a.fullName || a.displayName || a.email
      );

      const nameB = clean(
        b.fullName || b.displayName || b.email
      );

      return nameA.localeCompare(nameB);
    });
}

function prepareManagerField(message) {
  routingManager.replaceChildren();

  const queueOption =
    document.createElement("option");

  queueOption.value = "UNASSIGNED";
  queueOption.textContent =
    "Send to location management queue";

  routingManager.appendChild(queueOption);

  for (const manager of managerDirectory) {
    const option =
      document.createElement("option");

    option.value = manager.id;

    const name = clean(
      manager.fullName ||
      manager.displayName ||
      manager.email ||
      manager.id
    );

    const email = clean(manager.email);

    option.textContent = email && email !== name
      ? `${name} — ${email}`
      : name;

    routingManager.appendChild(option);
  }

  const assignedUid =
    clean(message.assignedManagerUid);

  const assignedExists =
    assignedUid &&
    managerDirectory.some(
      (manager) => manager.id === assignedUid
    );

  if (assignedExists) {
    routingManager.value = assignedUid;
  } else {
    routingManager.value = "UNASSIGNED";
  }

  routingManager.required = false;

  routeMessageButton.textContent =
    assignedExists
      ? "Update Routing"
      : "Send to Management Queue";
}


/* =========================================================
   WRITES
========================================================= */

function organizationRoutingValues(key) {
  if (key === "sandman-academy") {
    return {
      organizationId: "sandman-academy",
      organizationName:
        "Sandman Academy of Combat & Fitness",
      academyId: "sandman-academy",
      academyName:
        "Sandman Academy of Combat & Fitness"
    };
  }

  if (key === "yesc") {
    return {
      organizationId: "yesc",
      organizationName:
        "Youth Empowered Sports Club",
      academyId: null,
      academyName: ""
    };
  }

  return {
    organizationId: key,
    organizationName: "Other Organization",
    academyId: null,
    academyName: ""
  };
}

function locationRoutingValues(key) {
  const names = {
    solvang: "Solvang",
    lompoc: "Lompoc",
    "system-team": "System Team"
  };

  return {
    locationId: key,
    locationName: names[key] || key
  };
}

async function routeSelectedMessage(event) {
  event.preventDefault();

  if (!selectedMessage || !adminUser) {
    setFormStatus(
      "Select a message before routing.",
      "error"
    );
    return;
  }

  const organizationKey =
    clean(routingOrganization.value);

  const locationKey =
    clean(routingLocation.value);

  if (!organizationKey || !locationKey) {
    setFormStatus(
      "Choose an organization and location.",
      "error"
    );
    return;
  }

  const organization =
    organizationRoutingValues(
      organizationKey
    );

  const location =
    locationRoutingValues(
      locationKey
    );

  const managerUid =
    routingManager.value === "UNASSIGNED"
      ? null
      : clean(routingManager.value);

  setActionButtonsDisabled(true);
  setFormStatus("Saving routing…");

  try {
    const updates = {
      ...organization,
      ...location,

assignedAdminUid: adminUser.uid,
assignedManagerUid: managerUid,
assignedCoachUid: null,

coachNotes:
  clean(selectedMessage.coachNotes),

escalated:
  selectedMessage.escalated === true,

escalationReason:
  clean(selectedMessage.escalationReason),
  
routingStage: "MANAGEMENT_TRIAGE",

nextRoutingStage: "COACH_ASSIGNED",

assignmentStatus: managerUid
        ? "ASSIGNED"
        : "PENDING_MANAGEMENT",
      requiredManagerLevel:
        "LOCATION_MANAGER",

      routingPolicy:
        "ADMIN_TO_ORGANIZATION_LOCATION_MANAGER",

      managementNotes:
        clean(managementNotes.value),

      status: "REVIEWING",
      messageStatus: "REVIEWING",

      updatedAt: serverTimestamp()
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

    updateSummary();
    renderQueue();
    renderDetail();

    setFormStatus(
      managerUid
        ? "Message routed to the selected manager."
        : "Message sent to the organization and location management queue.",
      "success"
    );
  } catch (error) {
    console.error(
      "[reception] routing failed:",
      error
    );

    setFormStatus(
      "Routing could not be saved. Check admin access and Firestore rules.",
      "error"
    );
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function markSelectedResponded() {
  if (!selectedMessage || !adminUser) return;

  setActionButtonsDisabled(true);
  setFormStatus("Marking message responded…");

  try {
    const updates = {
      status: "RESPONDED",
      messageStatus: "RESPONDED",
      respondedByUid: adminUser.uid,
      respondedByRole: "SYSTEM_ADMIN",
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
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

    updateSummary();
    renderQueue();
    renderDetail();

    setFormStatus(
      "Message marked responded.",
      "success"
    );
  } catch (error) {
    console.error(
      "[reception] responded update failed:",
      error
    );

    setFormStatus(
      "The message could not be marked responded.",
      "error"
    );
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function closeSelectedMessage() {
  if (!selectedMessage || !adminUser) return;

  const confirmed = window.confirm(
    "Close this message?"
  );

  if (!confirmed) return;

  setActionButtonsDisabled(true);
  setFormStatus("Closing message…");

  try {
    const updates = {
      status: "CLOSED",
      messageStatus: "CLOSED",
      routingStage: "CLOSED",
      assignmentStatus: "CLOSED",
      closedByUid: adminUser.uid,
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
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

    updateSummary();
    renderQueue();
    renderDetail();

    setFormStatus(
      "Message closed.",
      "success"
    );
  } catch (error) {
    console.error(
      "[reception] close failed:",
      error
    );

    setFormStatus(
      "The message could not be closed.",
      "error"
    );
  } finally {
    setActionButtonsDisabled(false);
  }
}


/* =========================================================
   LOAD
========================================================= */

async function loadMessages() {
  refreshButton.disabled = true;

  loadingState.hidden = false;
  emptyState.hidden = true;
  errorState.hidden = true;
  messageQueue.hidden = true;

  try {
    adminUser = await requireAdmin();

    await loadManagerDirectory();

    const messagesQuery = query(
      collection(db, "general_messages"),
      orderBy("createdAt", "desc")
    );

    const snapshot =
      await getDocs(messagesQuery);

    allMessages =
      snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data()
      }));

    if (selectedMessage) {
      selectedMessage =
        allMessages.find(
          (message) =>
            message.id === selectedMessage.id
        ) || null;
    }

    updateSummary();
    renderQueue();
    renderDetail();
  } catch (error) {
    console.error(
      "[reception] load failed:",
      error
    );

    allMessages = [];
    selectedMessage = null;

    loadingState.hidden = true;
    emptyState.hidden = true;
    messageQueue.hidden = true;
    errorState.hidden = false;

    updateSummary();
    renderDetail();
  } finally {
    refreshButton.disabled = false;
  }
}


/* =========================================================
   EVENTS
========================================================= */

for (const control of [
  statusFilter,
  topicFilter,
  organizationFilter,
  locationFilter
]) {
  control.addEventListener(
    "change",
    renderQueue
  );
}

messageSearch.addEventListener(
  "input",
  renderQueue
);

refreshButton.addEventListener(
  "click",
  () => {
    void loadMessages();
  }
);

routingForm.addEventListener(
  "submit",
  (event) => {
    void routeSelectedMessage(event);
  }
);

markRespondedButton.addEventListener(
  "click",
  () => {
    void markSelectedResponded();
  }
);

closeMessageButton.addEventListener(
  "click",
  () => {
    void closeSelectedMessage();
  }
);


/* =========================================================
   START
========================================================= */

void loadMessages();
