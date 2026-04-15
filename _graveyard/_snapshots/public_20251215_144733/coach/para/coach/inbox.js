// public/coach/para/coach/inbox.js

// -----------------------------
//  FIREBASE IMPORTS
// -----------------------------
// ✅ Golden import for Coach Para-Comms Inbox
import {
  db,
  collection,
  query,
  orderBy,
  where,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "/data/firebase-init.js";

// -----------------------------
//  DOM HOOKS
// -----------------------------
// Adjust these IDs if your HTML uses different ones
const list = document.getElementById("inbox-list");
const emptyState = document.getElementById("empty-state");
const monthSelect = document.getElementById("month-select");
const searchInput = document.getElementById("search-input");

// Fallbacks so nothing crashes if an element is missing
const inboxList = list || document.querySelector("[data-role='inbox-list']");
const emptyBox =
  emptyState || document.querySelector("[data-role='inbox-empty']");
const monthPicker =
  monthSelect || document.querySelector("[data-role='month-select']");
const searchBox =
  searchInput || document.querySelector("[data-role='search-input']");

// -----------------------------
//  STATE
// -----------------------------
let allMessages = [];
let unsubscribe = null;

// -----------------------------
//  UTILS
// -----------------------------
function escapeHTML(str = "") {
  return str
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // e.g. "2025-12"
}

// -----------------------------
//  FIRESTORE LISTENER
// -----------------------------
function watchMonth(monthKey) {
  // stop previous listener if it exists
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (!monthKey) {
    // nothing selected
    renderList([]);
    return;
  }

  const monthRef = collection(db, "parentInbox", monthKey, "entries");
  const q = query(monthRef, orderBy("createdAt", "desc"));

  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          monthKey,
          ...data,
        });
      });
      renderList(messages);
    },
    (err) => {
      console.error("Error loading coach inbox:", err);
      renderList([]);
    }
  );
}

// -----------------------------
//  RENDER LIST
// -----------------------------
function renderList(messages) {
  if (!inboxList) return;

  inboxList.innerHTML = "";
  allMessages = messages.slice();

  if (!messages.length) {
    if (emptyBox) emptyBox.style.display = "block";
    return;
  }
  if (emptyBox) emptyBox.style.display = "none";

  messages.forEach((msg) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "inbox-row";

    // Firestore uses "message" for the body on your docs
    const previewText = (msg.body || msg.message || "").toString();

    // createdAt can be Timestamp, Date, or string
    let createdTime = new Date();
    if (msg.createdAt?.toDate) {
      createdTime = msg.createdAt.toDate();
    } else if (msg.createdAt) {
      createdTime = new Date(msg.createdAt);
    }

    row.innerHTML = `
      <div class="inbox-item ${msg.unread ? "unread" : "read"}">
        <div class="inbox-time">
          ${formatTime(createdTime)}
        </div>

        <div class="inbox-meta">
          From: ${escapeHTML(msg.parentName || "Parent")}
        </div>

        <div class="inbox-body">
          ${escapeHTML(previewText.slice(0, 140))}
        </div>
      </div>
    `;

    const monthKey = msg.monthKey;

    // Click → open full thread view
    row.addEventListener("click", () => {
      if (!monthKey || !msg.id) return;
      window.location.href = `/coach/para/coach/coach-thread.html?month=${encodeURIComponent(
        monthKey
      )}&id=${encodeURIComponent(msg.id)}`;
    });

    inboxList.appendChild(row);
  });
}

// -----------------------------
//  SEARCH FILTER
// -----------------------------
function applySearch(termRaw) {
  const term = termRaw.trim().toLowerCase();

  if (!term) {
    renderList(allMessages);
    return;
  }

  const filtered = allMessages.filter((msg) => {
    const haystack = [
      msg.subject,
      msg.message,
      msg.body,
      msg.parentName,
      msg.parentEmail,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });

  renderList(filtered);
}

// -----------------------------
//  INIT
// -----------------------------
(function init() {
  // Default to current month
  const currentMonthKey = getCurrentMonthKey();

  if (monthPicker) {
    // If dropdown already has options, try to select the current month
    const option = Array.from(monthPicker.options || []).find(
      (opt) => opt.value === currentMonthKey
    );
    if (option) {
      monthPicker.value = currentMonthKey;
    }

    monthPicker.addEventListener("change", () => {
      const selected = monthPicker.value || currentMonthKey;
      watchMonth(selected);
    });
  }

  // Start listener
  watchMonth(currentMonthKey);

  // Hook up search
  if (searchBox) {
    searchBox.addEventListener("input", (e) => {
      applySearch(e.target.value || "");
    });
  }
})();
