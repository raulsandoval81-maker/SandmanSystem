// /para/admin/announcements-feed.js

import {
  db,
  ensureSignedIn,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

import {
  renderAnnouncementCard,
  sortPinnedThenNewest
} from "/para/shared/announcements-ui.js";

const TEAM_ID = "law";

const feedEl = document.getElementById("bc-feed") || document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("bc-status") || document.getElementById("status");

// NEW
const toggleBtn = document.getElementById("toggle-archived");

let showArchived = false;

function setStatus(msg = "") {
  if (statusEl) statusEl.textContent = msg;
}

function showError(msg) {
  if (feedEl) {
    feedEl.innerHTML = `<div class="card" style="opacity:.75;">${msg}</div>`;
  }
  if (emptyEl) emptyEl.style.display = "none";
}

// AUTH
try {
  await ensureSignedIn();
} catch (e) {
  showError("Sign-in required. Refresh.");
  throw e;
}

if (!feedEl) throw new Error("Announcements feed container not found.");

// TOGGLE BUTTON
toggleBtn?.addEventListener("click", () => {
  showArchived = !showArchived;
  toggleBtn.textContent = showArchived ? "Hide Archived" : "Show Archived";
  renderFeed();
});

// QUERY
const qRef = query(
  collection(db, "paraAnnouncements"),
  orderBy("createdAt", "desc"),
  limit(80)
);

// RENDER
function renderAdminCard(item) {
  const base = renderAnnouncementCard(item, {
    showTeam: true,
    showAudience: true,
    showPinned: true,
    showCategory: true
  });

  return `
    <div class="admin-ann-wrap" data-id="${item.id}" data-pinned="${item.pinned === true}">
      ${base}
      <div class="meta-line" style="margin-top:-10px;margin-bottom:14px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
        <button data-act="pin" data-id="${item.id}">
          ${item.pinned ? "Unpin" : "Pin"}
        </button>

        <button data-act="edit" data-id="${item.id}">Edit</button>

        ${
          item.archived
            ? `<button data-act="unarchive" data-id="${item.id}">Unarchive</button>`
            : `<button data-act="archive" data-id="${item.id}">Archive</button>`
        }

        <button data-act="delete" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

let cachedItems = [];

function renderFeed() {
  if (!feedEl) return;

  const visible = cachedItems.filter((x) => {
    if (x.teamId !== TEAM_ID) return false;
    if (x.deleted === true) return false;

    if (showArchived) return true;
    return x.archived !== true;
  });

  const sorted = sortPinnedThenNewest(visible);

  if (!sorted.length) {
    feedEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  feedEl.innerHTML = sorted.map(renderAdminCard).join("");
  bindActions();
}

// ACTIONS
function bindActions() {
  feedEl.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.onclick = async () => {
      const act = btn.dataset.act;
      const id = btn.dataset.id;

      try {
        if (act === "pin") {
          const item = cachedItems.find(x => x.id === id);
          await updateDoc(doc(db, "paraAnnouncements", id), {
            pinned: !item.pinned
          });
        }

        if (act === "archive") {
          await updateDoc(doc(db, "paraAnnouncements", id), {
            archived: true,
            archivedAt: serverTimestamp()
          });
        }

        if (act === "unarchive") {
          await updateDoc(doc(db, "paraAnnouncements", id), {
            archived: false
          });
        }

        if (act === "delete") {
          await updateDoc(doc(db, "paraAnnouncements", id), {
            deleted: true
          });
        }

        if (act === "edit") {
          const item = cachedItems.find(x => x.id === id);
          const title = prompt("Edit title:", item.title || "");
          const msg = prompt("Edit message:", item.message || "");

          if (title !== null && msg !== null) {
            await updateDoc(doc(db, "paraAnnouncements", id), {
              title,
              message: msg,
              editedAt: serverTimestamp()
            });
          }
        }

      } catch (e) {
        console.error(e);
      }
    };
  });
}

// SNAPSHOT
onSnapshot(qRef, (snap) => {
  cachedItems = [];
  snap.forEach(d => cachedItems.push({ id: d.id, ...d.data() }));
  renderFeed();
});