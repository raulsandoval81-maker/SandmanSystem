// /communications/coach/inbox.js
// ------------------------------------------------------------
// Coach Parent-Request Inbox
//
// Filters:
// - Status
// - Search
// - Discipline
//
// Discipline sources supported:
// - discipline
// - programInterest
// - sport
// - art
// - track
//
// Existing requests without discipline remain labeled General.
// ------------------------------------------------------------

import {
  db,
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

const listEl =
  document.getElementById("inbox-list");

const emptyEl =
  document.getElementById("inbox-empty");

const searchEl =
  document.getElementById("inbox-search");

const statusEl =
  document.getElementById("inbox-status");

const filterBtns =
  document.querySelectorAll("[data-filter]");

const disciplineBtns =
  document.querySelectorAll(
    "[data-discipline-filter]"
  );

let currentFilter = "pending";
let currentDiscipline = "all";
let allRows = [];
let searchTerm = "";

/* =========================
   HELPERS
========================= */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(
  message = "",
  isError = false
) {
  if (!statusEl) return;

  statusEl.textContent = message;

  statusEl.style.color =
    isError
      ? "#fecaca"
      : "#ffdd48";
}

function getStatus(data = {}) {
  return String(
    data.status || "pending"
  )
    .trim()
    .toLowerCase();
}

function normalizeDiscipline(
  value = ""
) {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}

function getDiscipline(data = {}) {
  return normalizeDiscipline(
    data.discipline ||
    data.programInterest ||
    data.sport ||
    data.art ||
    data.track ||
    data.program ||
    ""
  );
}

function disciplineLabel(
  value = ""
) {
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    mma: "MMA",
    "submission-grappling":
      "Submission Grappling"
  };

  const normalized =
    normalizeDiscipline(value);

  return (
    labels[normalized] ||
    (
      normalized
        ? normalized
            .split("-")
            .map(
              (part) =>
                part.charAt(0).toUpperCase() +
                part.slice(1)
            )
            .join(" ")
        : "General"
    )
  );
}

function getIntentLabel(
  entryType = ""
) {
  const normalized =
    String(entryType || "")
      .trim()
      .toLowerCase();

  if (normalized === "free_pass") {
    return "FIRST LOOK";
  }

  if (normalized === "trial") {
    return "TRYING IT OUT";
  }

  if (normalized === "join") {
    return "READY TO COMMIT";
  }

  return "REQUEST";
}

function getIntentClass(
  entryType = ""
) {
  const normalized =
    String(entryType || "")
      .trim()
      .toLowerCase();

  if (normalized === "join") {
    return "intent-high";
  }

  if (normalized === "trial") {
    return "intent-mid";
  }

  return "intent-low";
}

function getTimeAgo(timestamp) {
  try {
    const date =
      timestamp?.toDate?.() ||
      (
        timestamp
          ? new Date(timestamp)
          : null
      );

    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    const difference =
      Date.now() - date.getTime();

    const minutes =
      Math.floor(
        difference / 60000
      );

    if (minutes < 5) {
      return "JUST NOW";
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours =
      Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days =
      Math.floor(hours / 24);

    return `${days}d ago`;
  } catch {
    return "";
  }
}

/* =========================
   FILTERING
========================= */

function matchesFilter(data = {}) {
  const status =
    getStatus(data);

  if (currentFilter === "pending") {
    return status === "pending";
  }

  if (currentFilter === "approved") {
    return (
      status === "approved_trial" ||
      status === "approved_join"
    );
  }

  if (currentFilter === "archived") {
    return status === "archived";
  }

  if (currentFilter === "deleted") {
    return status === "deleted";
  }

  return true;
}

function matchesDiscipline(
  data = {}
) {
  if (
    !currentDiscipline ||
    currentDiscipline === "all"
  ) {
    return true;
  }

  return (
    getDiscipline(data) ===
    currentDiscipline
  );
}

function matchesSearch(data = {}) {
  if (!searchTerm) {
    return true;
  }

  const haystack = [
    data.parentName,
    data.athleteName,
    data.message,
    data.email,
    data.phone,
    data.school,
    data.programInterest,
    data.discipline,
    disciplineLabel(
      getDiscipline(data)
    )
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(
    searchTerm
  );
}

/* =========================
   STATUS BADGE
========================= */

function buildBadge(data = {}) {
  const status =
    getStatus(data);

  const unread =
    data.coachHasUnread === true;

  if (
    unread &&
    status === "pending"
  ) {
    return `
      <span class="pill pill-unread">
        NEW
      </span>
    `;
  }

  if (
    status === "approved_trial"
  ) {
    return `
      <span class="pill pill-approved">
        TRIAL APPROVED
      </span>
    `;
  }

  if (
    status === "approved_join"
  ) {
    return `
      <span class="pill pill-approved">
        JOIN APPROVED
      </span>
    `;
  }

  if (status === "archived") {
    return `
      <span class="pill pill-archived">
        ARCHIVED
      </span>
    `;
  }

  if (status === "deleted") {
    return `
      <span class="pill pill-deleted">
        DELETED
      </span>
    `;
  }

  return `
    <span class="pill pill-read">
      PENDING
    </span>
  `;
}

/* =========================
   ACTIONS
========================= */

function buildActions(
  id,
  data = {}
) {
  const safeId = esc(id);
  const status = getStatus(data);

  if (status === "pending") {
    return `
      <div class="inbox-actions">
        <button
          type="button"
          class="btn-approve-trial"
          data-id="${safeId}"
        >
          Approve Trial
        </button>

        <button
          type="button"
          class="btn-approve-join"
          data-id="${safeId}"
        >
          Approve Join
        </button>

        <button
          type="button"
          class="btn-archive"
          data-id="${safeId}"
        >
          Archive
        </button>
      </div>
    `;
  }

  if (status === "archived") {
    return `
      <div class="inbox-actions">
        <button
          type="button"
          class="btn-restore"
          data-id="${safeId}"
        >
          Restore
        </button>

        <button
          type="button"
          class="btn-delete"
          data-id="${safeId}"
        >
          Delete
        </button>
      </div>
    `;
  }

  if (status === "deleted") {
    return `
      <div class="inbox-actions">
        <button
          type="button"
          class="btn-restore"
          data-id="${safeId}"
        >
          Restore
        </button>
      </div>
    `;
  }

  return `
    <div class="inbox-actions">
      <button
        type="button"
        class="btn-archive"
        data-id="${safeId}"
      >
        Archive
      </button>
    </div>
  `;
}

/* =========================
   ROW
========================= */

function buildRow(
  id,
  data = {}
) {
  const unread =
    data.coachHasUnread === true;

  const status =
    getStatus(data);

  const intentLabel =
    getIntentLabel(
      data.entryType
    );

  const intentClass =
    getIntentClass(
      data.entryType
    );

  const timeAgo =
    getTimeAgo(
      data.createdAt
    );

  const discipline =
    getDiscipline(data);

  const disciplineName =
    disciplineLabel(discipline);

  const athlete =
    esc(
      data.athleteName ||
      "New Request"
    );

  const parent =
    esc(
      data.parentName || ""
    );

  const age =
    data.athleteAge
      ? `(${esc(data.athleteAge)})`
      : "";

  const safeId =
    encodeURIComponent(id);

  return `
    <div
      class="inbox-row-wrap"
      data-id="${esc(id)}"
      data-discipline="${esc(discipline || "general")}"
    >
      <a
        class="inbox-item ${
          unread &&
          status === "pending"
            ? "unread"
            : "read"
        }"
        href="/communications/coach/inbox-view.html?id=${safeId}"
      >
        <div class="inbox-head">
          <div class="inbox-subject">
            ${athlete} ${age}
          </div>

          ${buildBadge(data)}
        </div>

        <div class="inbox-meta">
          ${
            parent
              ? `<span>${parent}</span>`
              : ""
          }

          <span
            class="intent ${esc(intentClass)}"
          >
            ${esc(intentLabel)}
          </span>

          <span
            class="pill discipline-pill"
          >
            ${esc(disciplineName)}
          </span>

          ${
            timeAgo
              ? `<span>${esc(timeAgo)}</span>`
              : ""
          }
        </div>

        <div class="inbox-preview">
          ${esc(data.message || "")}
        </div>
      </a>

      ${buildActions(id, data)}
    </div>
  `;
}

/* =========================
   RENDER
========================= */

function setActiveFilterButtons() {
  filterBtns.forEach(
    (button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.filter ===
          currentFilter
      );
    }
  );

  disciplineBtns.forEach(
    (button) => {
      button.classList.toggle(
        "is-active",
        normalizeDiscipline(
          button.dataset.disciplineFilter
        ) === currentDiscipline ||
        (
          button.dataset.disciplineFilter ===
            "all" &&
          currentDiscipline === "all"
        )
      );
    }
  );
}

function renderRows() {
  if (
    !listEl ||
    !emptyEl
  ) {
    return;
  }

  const rows =
    allRows.filter(
      (data) =>
        matchesFilter(data) &&
        matchesDiscipline(data) &&
        matchesSearch(data)
    );

  if (!rows.length) {
    listEl.innerHTML = "";
    emptyEl.style.display =
      "block";

    return;
  }

  emptyEl.style.display =
    "none";

  listEl.innerHTML =
    rows
      .map(
        (data) =>
          buildRow(
            data._id,
            data
          )
      )
      .join("");
}

/* =========================
   WRITE ACTIONS
========================= */

async function updateRequest(
  id,
  changes,
  message
) {
  setStatus(message);

  await updateDoc(
    doc(
      db,
      "paraParentInbox",
      id
    ),
    changes
  );

  setStatus("");
}

async function approveTrial(id) {
  await updateRequest(
    id,
    {
      status: "approved_trial",
      approvedAt:
        serverTimestamp()
    },
    "Approving trial..."
  );
}

async function approveJoin(id) {
  await updateRequest(
    id,
    {
      status: "approved_join",
      approvedAt:
        serverTimestamp()
    },
    "Approving enrollment..."
  );
}

async function archiveRequest(id) {
  await updateRequest(
    id,
    {
      status: "archived",
      archivedAt:
        serverTimestamp()
    },
    "Archiving request..."
  );
}

async function deleteRequest(id) {
  const confirmed =
    window.confirm(
      "Delete this request?"
    );

  if (!confirmed) return;

  await updateRequest(
    id,
    {
      status: "deleted",
      deletedAt:
        serverTimestamp()
    },
    "Deleting request..."
  );
}

async function restoreRequest(id) {
  await updateRequest(
    id,
    {
      status: "pending",
      restoredAt:
        serverTimestamp()
    },
    "Restoring request..."
  );
}

/* =========================
   LISTENER
========================= */

const qRef = query(
  collection(
    db,
    "paraParentInbox"
  ),
  orderBy(
    "createdAt",
    "desc"
  )
);

onSnapshot(
  qRef,
  (snapshot) => {
    allRows = [];

    snapshot.forEach(
      (document) => {
        allRows.push({
          ...document.data(),
          _id: document.id
        });
      }
    );

    setStatus("");
    renderRows();
  },
  (error) => {
    console.error(
      "[coach-inbox] snapshot failed:",
      error
    );

    setStatus(
      "Unable to load requests.",
      true
    );
  }
);

/* =========================
   CLICK HANDLING
========================= */

listEl?.addEventListener(
  "click",
  async (event) => {
    const actionButton =
      event.target.closest(
        `
          .btn-approve-trial,
          .btn-approve-join,
          .btn-archive,
          .btn-delete,
          .btn-restore
        `
      );

    if (!actionButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const id =
      actionButton.dataset.id;

    if (!id) return;

    actionButton.disabled = true;

    try {
      if (
        actionButton.classList.contains(
          "btn-approve-trial"
        )
      ) {
        await approveTrial(id);
      } else if (
        actionButton.classList.contains(
          "btn-approve-join"
        )
      ) {
        await approveJoin(id);
      } else if (
        actionButton.classList.contains(
          "btn-archive"
        )
      ) {
        await archiveRequest(id);
      } else if (
        actionButton.classList.contains(
          "btn-delete"
        )
      ) {
        await deleteRequest(id);
      } else if (
        actionButton.classList.contains(
          "btn-restore"
        )
      ) {
        await restoreRequest(id);
      }
    } catch (error) {
      console.error(
        "[coach-inbox] action failed:",
        error
      );

      setStatus(
        "Action failed. Check console.",
        true
      );

      actionButton.disabled =
        false;
    }
  }
);

/* =========================
   FILTER EVENTS
========================= */

filterBtns.forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        currentFilter =
          button.dataset.filter ||
          "pending";

        setActiveFilterButtons();
        renderRows();
      }
    );
  }
);

disciplineBtns.forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        const value =
          button.dataset.disciplineFilter ||
          "all";

        currentDiscipline =
          value === "all"
            ? "all"
            : normalizeDiscipline(
                value
              );

        setActiveFilterButtons();
        renderRows();
      }
    );
  }
);

searchEl?.addEventListener(
  "input",
  () => {
    searchTerm =
      searchEl.value
        .trim()
        .toLowerCase();

    renderRows();
  }
);

setActiveFilterButtons();