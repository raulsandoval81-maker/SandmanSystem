import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const messagesList =
  document.getElementById("messagesList");

const pageStatus =
  document.getElementById("pageStatus");

const template =
  document.getElementById("messageCardTemplate");

const refreshButton =
  document.getElementById("refreshMessages");
  
const countNew = document.getElementById("countNew");
const countReviewing = document.getElementById("countReviewing");
const countResponded = document.getElementById("countResponded");
const countClosed = document.getElementById("countClosed");

const ALLOWED_STATUSES = new Set([
  "NEW",
  "REVIEWING",
  "RESPONDED",
  "CLOSED"
]);

let allMessages = [];
let activeFilter = "ALL";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(value) {
  const status = clean(value).toUpperCase();

  return ALLOWED_STATUSES.has(status)
    ? status
    : "NEW";
}

function setPageStatus(message, type = "") {
  if (!pageStatus) return;

  pageStatus.textContent = message;
  pageStatus.classList.remove("is-error");

  if (type === "error") {
    pageStatus.classList.add("is-error");
  }
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "Unknown";
  }

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function topicLabel(topic) {
  const labels = {
    programs: "Programs",
    schedule: "Schedule",
    admissions: "Admissions",
    billing: "Billing",
    location: "Location",
    coaching: "Coaching / Professional Development",
    partnership: "Community / Partnership",
    other: "Other"
  };

  return labels[clean(topic)] || "General Question";
}

function languageLabel(language) {
  return clean(language).toLowerCase() === "es"
    ? "Spanish"
    : "English";
}

function updateSummary() {
  const counts = {
    NEW: 0,
    REVIEWING: 0,
    RESPONDED: 0,
    CLOSED: 0
  };

  for (const message of allMessages) {
    const status = normalizeStatus(
      message.messageStatus || message.status
    );

    counts[status] += 1;
  }

  if (countNew) {
    countNew.textContent = String(counts.NEW);
  }

  if (countReviewing) {
    countReviewing.textContent =
      String(counts.REVIEWING);
  }

  if (countResponded) {
    countResponded.textContent =
      String(counts.RESPONDED);
  }

  if (countClosed) {
    countClosed.textContent = String(counts.CLOSED);
  }
}

function getFilteredMessages() {
  if (activeFilter === "ALL") {
    return allMessages;
  }

  return allMessages.filter((message) => {
    const status = normalizeStatus(
      message.messageStatus || message.status
    );

    return status === activeFilter;
  });
}

function sortMessages(messages) {
  const statusOrder = {
    NEW: 0,
    REVIEWING: 1,
    RESPONDED: 2,
    CLOSED: 3
  };

  return [...messages].sort((a, b) => {
    const statusA = normalizeStatus(
      a.messageStatus || a.status
    );

    const statusB = normalizeStatus(
      b.messageStatus || b.status
    );

    const statusDifference =
      statusOrder[statusA] - statusOrder[statusB];

    if (statusDifference !== 0) {
      return statusDifference;
    }

    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;

    return timeB - timeA;
  });
}

function setCardStatus(element, status) {
  const normalized = normalizeStatus(status);

  element.textContent = normalized;
  element.dataset.status = normalized;
}

function setContactLink(anchor, value, prefix) {
  const cleaned = clean(value);

  if (!cleaned) {
    anchor.textContent = "Not provided";
    anchor.removeAttribute("href");
    return;
  }

  anchor.textContent = cleaned;
  anchor.href = `${prefix}${cleaned}`;
}

async function saveMessage(message, card) {
  const saveButton =
    card.querySelector(".message-card__save");

  const saveStatus =
    card.querySelector(".message-card__save-status");

  const notesInput =
    card.querySelector(".message-card__notes");

  const statusSelect =
    card.querySelector(".message-card__status-select");

  const statusBadge =
    card.querySelector(".message-card__status");

  const nextStatus =
    normalizeStatus(statusSelect.value);

  const nextNotes =
    clean(notesInput.value);

  saveButton.disabled = true;

  saveStatus.textContent = "Saving...";
  saveStatus.classList.remove(
    "is-error",
    "is-success"
  );

  try {
    await updateDoc(
      doc(db, "general_messages", message.id),
      {
        status: nextStatus,
        messageStatus: nextStatus,
        coachNotes: nextNotes,
        updatedAt: serverTimestamp()
      }
    );

    message.status = nextStatus;
    message.messageStatus = nextStatus;
    message.coachNotes = nextNotes;

    setCardStatus(statusBadge, nextStatus);
    updateSummary();

    saveStatus.textContent = "Saved.";
    saveStatus.classList.add("is-success");

    if (
      activeFilter !== "ALL" &&
      nextStatus !== activeFilter
    ) {
      renderMessages();
    }
  } catch (error) {
    console.error(
      "[general-messages] update failed:",
      error
    );

    saveStatus.textContent =
      "Could not save changes. Check Firestore access.";

    saveStatus.classList.add("is-error");
  } finally {
    saveButton.disabled = false;
  }
}

function buildMessageCard(message) {
  const fragment =
    template.content.cloneNode(true);

  const card =
    fragment.querySelector(".message-card");

  const topic =
    card.querySelector(".message-card__topic");

  const name =
    card.querySelector(".message-card__name");

  const statusBadge =
    card.querySelector(".message-card__status");

  const email =
    card.querySelector(".message-card__email");

  const phone =
    card.querySelector(".message-card__phone");

  const date =
    card.querySelector(".message-card__date");

  const language =
    card.querySelector(".message-card__language");

  const messageText =
    card.querySelector(".message-card__message");

  const notes =
    card.querySelector(".message-card__notes");

  const statusSelect =
    card.querySelector(".message-card__status-select");

  const saveButton =
    card.querySelector(".message-card__save");

  const status = normalizeStatus(
    message.messageStatus || message.status
  );

  topic.textContent = topicLabel(message.topic);

  name.textContent =
    clean(message.contactName) ||
    "Unknown Contact";

  setCardStatus(statusBadge, status);

  setContactLink(
    email,
    message.email,
    "mailto:"
  );

  setContactLink(
    phone,
    message.phone,
    "tel:"
  );

  date.textContent =
    formatDate(message.createdAt);

  language.textContent =
    languageLabel(message.language);

  messageText.textContent =
    clean(message.message) ||
    "No message provided.";

  notes.value =
    clean(message.coachNotes);

  statusSelect.value = status;

  saveButton.addEventListener("click", () => {
    saveMessage(message, card);
  });

  return fragment;
}

function renderMessages() {
  if (!messagesList || !template) return;

  messagesList.replaceChildren();

  const visibleMessages = sortMessages(
    getFilteredMessages()
  );

  if (visibleMessages.length === 0) {
    const empty =
      document.createElement("div");

    empty.className = "empty-state";

    empty.textContent =
      activeFilter === "ALL"
        ? "No general messages have been submitted yet."
        : `No ${activeFilter.toLowerCase()} messages found.`;

    messagesList.appendChild(empty);
    setPageStatus("");

    return;
  }

  const fragment =
    document.createDocumentFragment();

  for (const message of visibleMessages) {
    fragment.appendChild(
      buildMessageCard(message)
    );
  }

  messagesList.appendChild(fragment);

  setPageStatus(
    `${visibleMessages.length} message${
      visibleMessages.length === 1
        ? ""
        : "s"
    } shown.`
  );
}

async function loadMessages() {
  if (!refreshButton || !messagesList) return;

  refreshButton.disabled = true;

  setPageStatus("Loading messages...");

  try {
    await ensureSignedIn();

    const messagesQuery = query(
      collection(db, "general_messages"),
      orderBy("createdAt", "desc")
    );

    const snapshot =
      await getDocs(messagesQuery);

    allMessages = snapshot.docs.map(
      (snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data()
      })
    );

    updateSummary();
    renderMessages();
  } catch (error) {
    console.error(
      "[general-messages] load failed:",
      error
    );

    allMessages = [];

    updateSummary();
    messagesList.replaceChildren();

    const errorBox =
      document.createElement("div");

    errorBox.className = "empty-state";

    errorBox.textContent =
      "Messages could not be loaded. Confirm coach access and Firestore rules.";

    messagesList.appendChild(errorBox);

    setPageStatus(
      "Unable to load general messages.",
      "error"
    );
  } finally {
    refreshButton.disabled = false;
  }
}

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeFilter =
      button.dataset.filter || "ALL";

    for (const item of filterButtons) {
      item.classList.toggle(
        "is-active",
        item === button
      );
    }

    renderMessages();
  });
}

refreshButton?.addEventListener(
  "click",
  loadMessages
);

loadMessages();
