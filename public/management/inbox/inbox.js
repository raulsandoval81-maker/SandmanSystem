import {
  auth,
  db,
  functions,
  httpsCallable,
  collection,
  deleteDoc,
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

import { inboxView, passActionState } from "/management/inbox/inbox-state.js";


const managementIdentity =
  document.getElementById("managementIdentity");

const refreshButton =
  document.getElementById("refreshButton");

const signOutButton =
  document.getElementById("signOutButton");

const viewButtons = document.querySelectorAll("[data-inbox-view]");

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

const passPaymentPanel = document.getElementById("passPaymentPanel");
const passAttendanceStatus = document.getElementById("passAttendanceStatus");
const passPaymentStatus = document.getElementById("passPaymentStatus");
const passPaymentLinkPanel = document.getElementById("passPaymentLinkPanel");
const passPaymentUrl = document.getElementById("passPaymentUrl");
const openPassPaymentLink = document.getElementById("openPassPaymentLink");
const copyPassPaymentLink = document.getElementById("copyPassPaymentLink");
const collectPassPaymentButton = document.getElementById("collectPassPaymentButton");
const confirmPassAttendanceButton = document.getElementById("confirmPassAttendanceButton");

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
let expandedMessageId = null;
let coachDirectory = [];
let currentView = "ACTIVE";


const TOPIC_LABELS = {
  programs: "Programs",
  schedule: "Schedule",
  admissions: "Admissions",
  "request-pass": "Request a Pass",
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

const PASS_LABELS = {
  "combat-dropin-1day": "Combat — 1 Day Pass — $25",
  "combat-dropin-2day": "Combat — 2 Day Pass — $40",
  "fitness-dropin": "Fitness — 1 Day Drop-In — $15"
};

function passLabel(value) {
  const key = clean(value);

  return PASS_LABELS[key] ||
    key;
}

function renderPassPayment(message) {
  const isPass = clean(message.topic) === "request-pass";
  const actions = passActionState(message);
  const paymentState = clean(message.passPaymentStatus).toLowerCase();
  const attendanceConfirmed = Boolean(message.passAttendanceConfirmedAt);

  passPaymentPanel.hidden = !isPass;
  passPaymentLinkPanel.hidden = true;
  passPaymentUrl.value = "";
  openPassPaymentLink.removeAttribute("href");
  if (!isPass) {
    confirmPassAttendanceButton.hidden = true;
    collectPassPaymentButton.hidden = true;
    return;
  }

  passAttendanceStatus.textContent = attendanceConfirmed
    ? `Attendance confirmed ${formatDate(message.passAttendanceConfirmedAt)}`
    : "Attendance not confirmed";
  confirmPassAttendanceButton.hidden = !actions.confirmAttendance;
  passPaymentStatus.textContent = paymentState === "paid"
    ? "Paid"
    : paymentState === "pending"
      ? "Payment pending"
      : "No payment started";
  collectPassPaymentButton.hidden = !actions.collectPayment;
  collectPassPaymentButton.textContent = paymentState === "pending"
    ? "Get Payment Link"
    : "Collect Payment";
}

function showPassPaymentLink(url) {
  passPaymentUrl.value = url;
  openPassPaymentLink.href = url;
  passPaymentLinkPanel.hidden = false;
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


function matchesFilters(message) {
  if (inboxView(message) !== currentView) {
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
    message.passType,
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
    .filter(matchesFilters);
}

function showView(view) {
  currentView = view;
  if (selectedMessage && inboxView(selectedMessage) !== view) {
    selectedMessage = null;
    renderDetail();
  }
  for (const button of viewButtons) {
    const active = button.dataset.inboxView === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  renderQueue();
}


function createChip(text) {
  const chip =
    document.createElement("span");

  chip.className = "chip";
  chip.textContent = text;

  return chip;
}


function createMessageItem(message) {
  const wrapper =
    document.createElement("article");

  wrapper.className =
    "message-item-wrap";

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "message-item";

  if (
    selectedMessage?.id === message.id
  ) {
    button.classList.add("is-selected");
  }

  const top =
    document.createElement("div");

  top.className = "message-item__top";

  const identity =
    document.createElement("div");

  identity.className =
    "message-item__identity";

  const name =
    document.createElement("span");

  name.className =
    "message-item__name";

  name.textContent =
    clean(message.contactName) ||
    "Unknown contact";

  const time =
    document.createElement("span");

  time.className =
    "message-item__time";

  time.textContent =
    formatDate(message.createdAt);

  const chevron =
    document.createElement("button");

  chevron.type = "button";
  chevron.className =
    "message-item__chevron";

  const isExpanded =
    expandedMessageId === message.id;

  chevron.textContent =
    isExpanded ? "⌃" : "⌄";

  chevron.setAttribute(
    "aria-expanded",
    String(isExpanded)
  );

  chevron.setAttribute(
    "aria-label",
    isExpanded
      ? "Hide message actions"
      : "Show message actions"
  );

  const topic =
    document.createElement("div");

  topic.className =
    "message-item__topic";

  topic.textContent =
    TOPIC_LABELS[clean(message.topic)] ||
    clean(message.topic) ||
    "General Question";

  const preview =
    document.createElement("div");

  preview.className =
    "message-item__preview";

  preview.textContent =
    clean(message.message) ||
    "No message provided.";

  const meta =
    document.createElement("div");

  meta.className =
    "message-item__meta";

  meta.append(
    createChip(stageValue(message)),
    createChip(
      clean(message.locationName) ||
      clean(message.locationId) ||
      "No location"
    ),
    createChip(assignmentValue(message))
  );

  identity.append(name, time);
  top.append(identity);

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

  chevron.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      expandedMessageId =
        expandedMessageId === message.id
          ? null
          : message.id;

      renderQueue();
    }
  );

  wrapper.append(
    button,
    chevron
  );

  if (isExpanded) {
    const actions =
      document.createElement("div");

    actions.className =
      "message-item__quick";

    const openButton =
      document.createElement("button");

    openButton.type = "button";
    openButton.className =
      "button button-primary message-item__action";

    openButton.textContent =
      "Open Message";

    openButton.addEventListener(
      "click",
      () => selectMessage(message.id)
    );

    const replyButton =
      document.createElement("button");

    replyButton.type = "button";
    replyButton.className =
      "button button-secondary message-item__action";

    replyButton.textContent =
      "Reply";

    replyButton.addEventListener(
      "click",
      () => {
        selectMessage(message.id);

        const response =
          document.getElementById(
            "suggestedResponseText"
          );

        response?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        response?.focus();
      }
    );

    const actionDefinitions = [
      [
        "Mark Responded",
        "markRespondedButton",
        "button-secondary"
      ],
      [
        "Admin Guidance",
        "requestAdminGuidanceButton",
        "button-secondary"
      ],
      [
        "Close",
        "closeMessageButton",
        "button-secondary"
      ],
      [
        "Delete",
        "deleteMessageButton",
        "button-secondary message-item__action--danger"
      ]
    ];

    actions.append(
      openButton,
      replyButton
    );

    for (
      const [
        label,
        targetId,
        className
      ] of actionDefinitions
    ) {
      const action =
        document.createElement("button");

      action.type = "button";
      action.className =
        `button ${className} message-item__action`;

      action.textContent = label;

      action.addEventListener(
        "click",
        () => {
          selectMessage(message.id);

          document
            .getElementById(targetId)
            ?.click();
        }
      );

      actions.appendChild(action);
    }

    wrapper.appendChild(actions);
  }

  return wrapper;
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
  const actions = passActionState(message);

  selectedMessageId.value = message.id;

  detailTopic.textContent =
    topicLabel(message.topic);

  detailContactName.textContent =
    clean(message.contactName) ||
    "Unknown Contact";

  detailSubmittedAt.textContent =
    `Submitted ${formatDate(message.createdAt)}`;

  detailStatus.textContent = inboxView(message);

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

    managementReplyEmail.disabled =
      !email;

    managementReplyEmail.title =
      email
        ? `Send response to ${email}`
        : "No email address provided";
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

  const selectedPass =
    passLabel(message.passType);

  const messageText =
    clean(message.message) ||
    "No message provided.";

  detailMessage.textContent =
    selectedPass
      ? `Pass: ${selectedPass}\n\n${messageText}`
      : messageText;

  renderPassPayment(message);

  document.getElementById("closeMessageButton").hidden = !actions.close;
  document.getElementById("markRespondedButton").hidden =
    inboxView(message) === "RESPONDED" || inboxView(message) === "CLOSED";
  document.getElementById("requestAdminGuidanceButton").hidden =
    inboxView(message) === "CLOSED" || stageValue(message) === "ADMIN_GUIDANCE_REQUESTED";

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

  const locationIds =
    managementContext.scope.locationIds;

  for (let index = 0; index < locationIds.length; index += 10) {
    const chunk = locationIds.slice(index, index + 10);
    snapshots.push(
      await getDocs(query(
        collection(db, "general_messages"),
        where("locationId", "in", chunk),
        where("assignedManagerUid", "==", managementContext.user.uid)
      )),
      await getDocs(query(
        collection(db, "general_messages"),
        where("locationId", "in", chunk),
        where("assignedManagerUid", "==", null),
        where("assignmentStatus", "==", "PENDING_MANAGEMENT")
      ))
    );
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
      if (selectedMessage && inboxView(selectedMessage) === "CLOSED") {
        selectedMessage = null;
      }
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


async function sendManagementEmail() {
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

  const recipient =
    clean(selectedMessage.email);

  const responseText =
    clean(
      suggestedResponseText?.value
    );

  if (!recipient) {
    setFormStatus(
      "This message does not have an email address.",
      "error"
    );
    return;
  }

  if (!responseText) {
    setFormStatus(
      "Write a response before sending.",
      "error"
    );
    return;
  }

  const confirmed =
    window.confirm(
      `Send this response to ${recipient}?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    document.getElementById(
      "managementReplyEmail"
    );

  if (button) {
    button.disabled = true;
  }

  setFormStatus(
    `Sending email to ${recipient}...`
  );

  try {
    const sendEmail =
      httpsCallable(
        functions,
        "sendManagementMessageEmail"
      );

    await sendEmail({
      messageId:
        selectedMessage.id,

      responseText,
    });

    await loadInbox();
    if (selectedMessage) showView(inboxView(selectedMessage));

    setFormStatus(
      `Email sent to ${recipient}. Message marked responded.`,
      "success"
    );

  } catch (error) {
    console.error(
      "[management-inbox] email send failed:",
      error
    );

    setFormStatus(
      error?.message ||
      "The email could not be sent.",
      "error"
    );

  } finally {
    const currentButton =
      document.getElementById(
        "managementReplyEmail"
      );

    if (currentButton) {
      currentButton.disabled =
        !clean(
          selectedMessage?.email
        );
    }
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
    await httpsCallable(functions, "markManagementMessageResponded")({
      messageId: selectedMessage.id
    });
    await loadInbox();
    if (selectedMessage) showView(inboxView(selectedMessage));

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


async function closeManagementMessage() {
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

  const confirmed =
    window.confirm(
      "Close this message and send it to Management Intelligence?"
    );

  if (!confirmed) {
    return;
  }

  const button =
    document.getElementById(
      "closeMessageButton"
    );

  if (button) {
    button.disabled = true;
  }

  setFormStatus(
    "Closing message..."
  );

  try {
    const storeIntelligence =
      httpsCallable(
        functions,
        "storeClosedMessageIntelligence"
      );

    await storeIntelligence({
      messageId: selectedMessage.id
    });

    selectedMessage = null;

    await loadInbox();

    setFormStatus(
      "Message closed and stored in Management Intelligence.",
      "success"
    );

  } catch (error) {
    console.error(
      "[management-inbox] close failed:",
      error
    );

    setFormStatus(
      error?.message ||
      "The message could not be closed.",
      "error"
    );

  } finally {
    const currentButton =
      document.getElementById(
        "closeMessageButton"
      );

    if (currentButton) {
      currentButton.disabled = false;
    }
  }
}


async function deleteManagementMessage() {
  if (!selectedMessage || !managementContext) {
    setFormStatus("Select a message first.", "error");
    return;
  }

  const messageId = selectedMessage.id;
  const contactName = clean(selectedMessage.contactName) || "this contact";
  const topic = clean(selectedMessage.topic) || "this message";

  const confirmed = window.confirm(
    `Permanently delete this message?\n\n${contactName}\n${topic}\n\nThis cannot be undone.`
  );

  if (!confirmed) return;

  const button =
    document.getElementById("deleteMessageButton");

  if (button) button.disabled = true;

  setFormStatus("Deleting message...");

  try {
    await deleteDoc(
      doc(
        db,
        "general_messages",
        messageId
      )
    );

    selectedMessage = null;

    await loadInbox();

    setFormStatus(
      "Message permanently deleted.",
      "success"
    );
  } catch (error) {
    console.error(
      "[management-inbox] delete failed:",
      error
    );

    setFormStatus(
      error?.message ||
      "The message could not be deleted.",
      "error"
    );
  } finally {
    const currentButton =
      document.getElementById("deleteMessageButton");

    if (currentButton) {
      currentButton.disabled = false;
    }
  }
}


async function collectPassPayment() {
  if (!selectedMessage) {
    setFormStatus("Select a pass request first.", "error");
    return;
  }
  const messageId = selectedMessage.id;
  const payerEmail = clean(selectedMessage.email);
  const confirmed = window.confirm(
    `Create or retrieve a secure payment link for ${passLabel(selectedMessage.passType)}?\n\nPayer email: ${payerEmail || "missing"}\n\nAttendance must already be confirmed. Verify the payer email before continuing.`
  );
  if (!confirmed) return;

  collectPassPaymentButton.disabled = true;
  setFormStatus("Preparing the secure payment link...");
  try {
    const result = await httpsCallable(functions, "createManagementPassCheckout")({ messageId });
    const data = result.data || {};
    const checkoutUrl = clean(data.checkoutUrl);
    const checkoutSessionId = clean(data.checkoutSessionId);
    const parsedUrl = new URL(checkoutUrl);
    if (parsedUrl.protocol !== "https:" || !checkoutSessionId
        || data.paymentStatus !== "pending"
        || !Number.isInteger(data.amountCents)
        || data.currency !== "usd") {
      throw new Error("The payment service returned an incomplete checkout link.");
    }

    await loadInbox();
    if (selectedMessage?.id === messageId) {
      showView(inboxView(selectedMessage));
      showPassPaymentLink(checkoutUrl);
      setFormStatus("Payment link ready. The pass remains pending until Stripe confirms payment.", "success");
    }
  } catch (error) {
    console.error("[management-inbox] pass checkout failed:", error);
    setFormStatus(error?.message || "The payment link could not be prepared.", "error");
  } finally {
    collectPassPaymentButton.disabled = false;
  }
}


async function confirmPassAttendance() {
  if (!selectedMessage) {
    setFormStatus("Select a pass request first.", "error");
    return;
  }
  const messageId = selectedMessage.id;
  if (!window.confirm("Confirm that the athlete actually attended before collecting payment?")) return;

  confirmPassAttendanceButton.disabled = true;
  setFormStatus("Confirming attendance...");
  try {
    await httpsCallable(functions, "confirmManagementPassAttendance")({ messageId });
    await loadInbox();
    if (selectedMessage) showView(inboxView(selectedMessage));
    setFormStatus("Attendance confirmed. Payment collection is now available.", "success");
  } catch (error) {
    console.error("[management-inbox] pass attendance confirmation failed:", error);
    setFormStatus(error?.message || "Attendance could not be confirmed.", "error");
  } finally {
    confirmPassAttendanceButton.disabled = false;
  }
}


async function copyPassPaymentUrl() {
  const url = clean(passPaymentUrl.value);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setFormStatus("Payment link copied.", "success");
  } catch (error) {
    passPaymentUrl.focus();
    passPaymentUrl.select();
    setFormStatus("Copy was unavailable. The payment link is selected for manual copy.", "error");
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

    showView(inboxView(selectedMessage));
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

    showView(inboxView(selectedMessage));
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
  .getElementById("managementReplyEmail")
  ?.addEventListener(
    "click",
    () => {
      void sendManagementEmail();
    }
  );


document
  .getElementById("markRespondedButton")
  ?.addEventListener(
    "click",
    markManagementResponded
  );

document
  .getElementById("closeMessageButton")
  ?.addEventListener(
    "click",
    () => {
      void closeManagementMessage();
    }
  );

document
  .getElementById("deleteMessageButton")
  ?.addEventListener(
    "click",
    () => {
      void deleteManagementMessage();
    }
  );

collectPassPaymentButton?.addEventListener("click", () => {
  void collectPassPayment();
});

confirmPassAttendanceButton?.addEventListener("click", () => {
  void confirmPassAttendance();
});

copyPassPaymentLink?.addEventListener("click", () => {
  void copyPassPaymentUrl();
});

document
  .getElementById("requestAdminGuidanceButton")
  ?.addEventListener(
    "click",
    requestAdminGuidance
  );


for (const button of viewButtons) {
  button.addEventListener("click", () => showView(button.dataset.inboxView));
}

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
