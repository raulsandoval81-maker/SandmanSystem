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

import {
  getManagementResponse,
  getManagementResponseFamily
} from "/management/shared/responses/management-responses.js";


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

const suggestedResponseLabel =
  document.getElementById(
    "suggestedResponseLabel"
  );

const suggestedResponseSelect =
  document.getElementById(
    "suggestedResponseSelect"
  );

const suggestedResponseText =
  document.getElementById(
    "suggestedResponseText"
  );

const copySuggestedResponseButton =
  document.getElementById(
    "copySuggestedResponseButton"
  );


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
  pricing: "Pricing / Fees",
  coaching: "Coaching / Staff Development",
  partnership: "Community / Partnership",
  "stay-connected": "Stay Connected",
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


function populateSuggestedResponses(message) {
  if (!suggestedResponseSelect) {
    return;
  }

  const family =
    getManagementResponseFamily(
      message?.topic
    );

  suggestedResponseSelect.innerHTML = "";

  for (const template of family.templates) {
    const option =
      document.createElement("option");

    option.value = template.id;
    option.textContent = template.label;

    suggestedResponseSelect.appendChild(
      option
    );
  }

  const first =
    family.templates[0];

  if (first) {
    suggestedResponseSelect.value =
      first.id;
  }
}


function renderSuggestedResponse(message) {
  if (!message) {
    return;
  }

  const templateId =
    clean(
      suggestedResponseSelect?.value
    );

  const suggested =
    getManagementResponse(
      message.topic,
      templateId
    );

  if (suggestedResponseLabel) {
    suggestedResponseLabel.textContent =
      `${suggested.familyLabel} — ${suggested.label}`;
  }

  if (suggestedResponseText) {
    suggestedResponseText.value =
      suggested.response || "";
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

  const managementReplyEmail =
    document.getElementById(
      "managementReplyEmail"
    );

  if (managementReplyEmail) {
    const email = clean(message.email);

    if (email) {
      managementReplyEmail.href =
        `mailto:${email}`;

      managementReplyEmail.removeAttribute(
        "aria-disabled"
      );
    } else {
      managementReplyEmail.href = "#";
      managementReplyEmail.setAttribute(
        "aria-disabled",
        "true"
      );
    }
  }

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

  populateSuggestedResponses(
    message
  );

  renderSuggestedResponse(
    message
  );

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

  if (managementContext.centralManagement) {
    const centralSnapshot = await getDocs(
      query(
        collection(db, "general_messages"),
        where(
          "queueScope",
          "==",
          "CENTRAL_MANAGEMENT"
        )
      )
    );

    snapshots.push(centralSnapshot);
  }

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


async function markManagementResponded() {
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

  const button =
    document.getElementById(
      "markRespondedButton"
    );

  if (button) {
    button.disabled = true;
  }

  setFormStatus(
    "Marking message responded..."
  );

  try {
    const updates = {
      assignedManagerUid:
        managementContext.user.uid,

      status: "RESPONDED",
      messageStatus: "RESPONDED",

      respondedByUid:
        managementContext.user.uid,

      respondedByRole:
        managementContext.isSystemAdmin
          ? "SYSTEM_ADMIN"
          : "MANAGEMENT",

      respondedAt:
        serverTimestamp(),

      routingStage:
        "MANAGEMENT_RESPONDED",

      assignmentStatus:
        "ASSIGNED",

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
      "Message marked responded by Management.",
      "success"
    );

  } catch (error) {
    console.error(
      "[management-inbox] responded update failed:",
      error
    );

    setFormStatus(
      "The response status could not be saved.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}


async function requestAdminGuidance() {
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

  const button =
    document.getElementById(
      "requestAdminGuidanceButton"
    );

  if (button) {
    button.disabled = true;
  }

  setFormStatus(
    "Requesting System Admin guidance..."
  );

  try {
    const updates = {
      assignedManagerUid:
        managementContext.user.uid,

      escalated: true,

      escalationReason:
        "MANAGEMENT_GUIDANCE_REQUEST",

      routingStage:
        "ADMIN_GUIDANCE_REQUESTED",

      nextRoutingStage:
        "MANAGEMENT_RESPONSE",

      assignmentStatus:
        "ASSIGNED",

      status:
        "REVIEWING",

      messageStatus:
        "REVIEWING",

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
      "System Admin guidance requested. Management still owns the response.",
      "success"
    );

  } catch (error) {
    console.error(
      "[management-inbox] admin guidance request failed:",
      error
    );

    setFormStatus(
      "System Admin guidance could not be requested.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
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


async function copySuggestedResponse() {
  const text =
    clean(
      suggestedResponseText?.value
    );

  if (!text) {
    setFormStatus(
      "No suggested response is available to copy.",
      "error"
    );
    return;
  }

  try {
    await navigator.clipboard.writeText(
      text
    );

    setFormStatus(
      "Suggested response copied.",
      "success"
    );
  } catch (error) {
    console.error(
      "[management-inbox] copy response failed:",
      error
    );

    suggestedResponseText?.focus();
    suggestedResponseText?.select();

    setFormStatus(
      "Copy failed. The response has been selected for manual copy.",
      "error"
    );
  }
}


suggestedResponseSelect
  ?.addEventListener(
    "change",
    () => {
      if (!selectedMessage) {
        return;
      }

      renderSuggestedResponse(
        selectedMessage
      );
    }
  );


copySuggestedResponseButton
  ?.addEventListener(
    "click",
    () => {
      void copySuggestedResponse();
    }
  );


document
  .getElementById("markRespondedButton")
  ?.addEventListener(
    "click",
    markManagementResponded
  );

document
  .getElementById("requestAdminGuidanceButton")
  ?.addEventListener(
    "click",
    requestAdminGuidance
  );


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
