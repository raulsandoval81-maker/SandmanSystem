// ----------------------------------------------------------
// /communications/coach/hub.js
//
// Coach Communication Hub
//
// Reads established parent-athlete threads from:
//   paraThreads/{athleteUid}
//
// Join and trial requests remain in:
//   paraParentInbox
//
// Features:
// - Unread threads
// - Recent active threads
// - Open thread by athlete ID
// - Discipline labels
// - Archived/deleted threads hidden
// - Client-side sorting avoids composite-index dependency
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  getDocs
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const ROOT = "paraThreads";

const UNREAD_LIMIT = 8;
const RECENT_LIMIT = 8;

/* =========================
   DOM
========================= */

const openIdEl =
  document.getElementById("open-id");

const btnOpen =
  document.getElementById("btn-open");

const statusEl =
  document.getElementById("status");

const listEl =
  document.getElementById("list");

const status2El =
  document.getElementById("status2");

const list2El =
  document.getElementById("list2");

/* =========================
   STATE
========================= */

let threadRows = [];

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

function dateFromValue(value) {
  if (!value) return null;

  try {
    if (
      typeof value.toDate === "function"
    ) {
      return value.toDate();
    }

    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date;
  } catch {
    return null;
  }
}

function safeDate(value) {
  const date =
    dateFromValue(value);

  return date
    ? date.toLocaleString()
    : "";
}

function timestampValue(value) {
  const date =
    dateFromValue(value);

  return date
    ? date.getTime()
    : 0;
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

  if (labels[normalized]) {
    return labels[normalized];
  }

  if (!normalized) {
    return "General";
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function getThreadTime(data = {}) {
  return (
    data.lastReplyAt ||
    data.updatedAt ||
    data.createdAt ||
    null
  );
}

function threadHref(id) {
  return (
    `/communications/coach/coach-thread.html` +
    `?athleteUid=${encodeURIComponent(id)}`
  );
}

function isVisibleThread(
  data = {}
) {
  return (
    data.archived !== true &&
    data.deleted !== true
  );
}

/* =========================
   CARD
========================= */

function makeCard(
  id,
  data = {},
  {
    unread = false
  } = {}
) {
  const athleteName =
    data.athleteName ||
    data.publicName ||
    data.fullName ||
    id;

  const parentName =
    data.parentName ||
    data.guardianName ||
    data.familyName ||
    "Parent/Guardian";

  const subject =
    data.subject ||
    `${athleteName} Family Thread`;

  const body =
    data.lastBody ||
    data.preview ||
    "No message preview.";

  const when =
    safeDate(
      getThreadTime(data)
    );

  const discipline =
    disciplineLabel(
      data.discipline ||
      data.primaryDiscipline ||
      data.sport ||
      data.art ||
      ""
    );

  const lastSender =
    String(
      data.lastSender ||
      data.lastReplyFrom ||
      ""
    )
      .trim()
      .toLowerCase();

  const senderLabel =
    lastSender === "coach"
      ? "Coach replied"
      : lastSender === "parent"
        ? "Parent replied"
        : "";

  return `
    <a
      class="card"
      href="${threadHref(id)}"
    >
      <div class="title">
        ${esc(subject)}

        ${
          unread
            ? `
              <span class="pill unread">
                UNREAD
              </span>
            `
            : ""
        }
      </div>

      <div class="sub">
        ${esc(parentName)}
        ·
        ${esc(athleteName)}
        ·
        ${esc(discipline)}

        ${
          senderLabel
            ? ` · ${esc(senderLabel)}`
            : ""
        }

        ${
          when
            ? ` · ${esc(when)}`
            : ""
        }
      </div>

      <div class="body">
        ${esc(body)}
      </div>
    </a>
  `;
}

/* =========================
   LOAD SOURCE
========================= */

async function loadThreads() {
  const snapshot =
    await getDocs(
      collection(db, ROOT)
    );

  threadRows =
    snapshot.docs
      .map((document) => ({
        id: document.id,
        data: document.data() || {}
      }))
      .filter((row) =>
        isVisibleThread(row.data)
      )
      .sort((a, b) => {
        return (
          timestampValue(
            getThreadTime(b.data)
          ) -
          timestampValue(
            getThreadTime(a.data)
          )
        );
      });
}

/* =========================
   UNREAD
========================= */

function renderUnread() {
  if (
    !statusEl ||
    !listEl
  ) {
    return;
  }

  const unreadRows =
    threadRows
      .filter(
        (row) =>
          row.data.coachHasUnread === true
      )
      .slice(0, UNREAD_LIMIT);

  if (!unreadRows.length) {
    statusEl.textContent =
      "No unread threads.";

    listEl.innerHTML = "";

    return;
  }

  statusEl.textContent = "";

  listEl.innerHTML =
    unreadRows
      .map((row) =>
        makeCard(
          row.id,
          row.data,
          {
            unread: true
          }
        )
      )
      .join("");
}

/* =========================
   RECENT
========================= */

function renderRecent() {
  if (
    !status2El ||
    !list2El
  ) {
    return;
  }

  const recentRows =
    threadRows.slice(
      0,
      RECENT_LIMIT
    );

  if (!recentRows.length) {
    status2El.textContent =
      "No active threads yet.";

    list2El.innerHTML = "";

    return;
  }

  status2El.textContent = "";

  list2El.innerHTML =
    recentRows
      .map((row) =>
        makeCard(
          row.id,
          row.data,
          {
            unread:
              row.data.coachHasUnread ===
              true
          }
        )
      )
      .join("");
}

/* =========================
   BOOT
========================= */

async function loadHub() {
  if (statusEl) {
    statusEl.textContent =
      "Loading…";
  }

  if (status2El) {
    status2El.textContent =
      "Loading…";
  }

  if (listEl) {
    listEl.innerHTML = "";
  }

  if (list2El) {
    list2El.innerHTML = "";
  }

  try {
    await loadThreads();

    renderUnread();
    renderRecent();
  } catch (error) {
    console.error(
      "[coach-hub] thread load failed:",
      error
    );

    if (statusEl) {
      statusEl.textContent =
        "Failed to load unread threads.";
    }

    if (status2El) {
      status2El.textContent =
        "Failed to load recent threads.";
    }
  }
}

/* =========================
   OPEN BY ATHLETE ID
========================= */

function openThreadById() {
  const id =
    String(
      openIdEl?.value || ""
    )
      .trim()
      .toUpperCase();

  if (!id) return;

  window.location.href =
    threadHref(id);
}

btnOpen?.addEventListener(
  "click",
  openThreadById
);

openIdEl?.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    openThreadById();
  }
);

await loadHub();