// /para/coach/broadcast.js
// ------------------------------------------------------------
// Broadcast Console (Admin) — V1 (Announcements)
// - Category dropdown drives Title (auto)
// - Custom title only required when Category = "Other"
// - Admin feed controls: PIN + EDIT + ARCHIVE + DELETE
// - Team auto-stamp: teamId="law"
// - FEED STYLE: shared with parent/athlete via announcements-ui.js
// - Added: Show/Hide Archived toggle
// ------------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc
} from "/assets/js/firebase-init-para.js";

import {
  renderAnnouncementCard,
  sortPinnedThenNewest
} from "/para/shared/announcements-ui.js";

await ensureSignedIn();

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------
const TEAM_ID = "law";

// ------------------------------------------------------------
// DOM
// ------------------------------------------------------------
const categoryEl = document.getElementById("bc-category");
const titleEl    = document.getElementById("bc-title");
const messageEl  = document.getElementById("bc-message");
const audTypeEl  = document.getElementById("bc-audience-type");
const btnPost    = document.getElementById("bc-post");
const feedEl     = document.getElementById("bc-feed");
const statusEl   = document.getElementById("bc-status");

// Optional toggle button if present in HTML
const toggleArchivedBtn = document.getElementById("toggle-archived");

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
let annItems = [];
let showArchived = false;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

// Category → Title behavior
function syncCategoryTitle() {
  const cat = String(categoryEl?.value || "").trim();
  const isOther = cat === "Other";

  if (!titleEl) return;

  titleEl.disabled = !isOther;
  titleEl.placeholder = isOther ? "Custom title…" : "Preset title will be used";

  if (!isOther) titleEl.value = "";
}

function getTitle() {
  const cat = String(categoryEl?.value || "").trim();
  if (!cat) return "";
  if (cat !== "Other") return cat;
  return String(titleEl?.value || "").trim();
}

function updateArchivedToggleLabel() {
  if (!toggleArchivedBtn) return;
  toggleArchivedBtn.textContent = showArchived ? "Hide Archived" : "Show Archived";
}

syncCategoryTitle();
categoryEl?.addEventListener("change", syncCategoryTitle);
updateArchivedToggleLabel();

// ------------------------------------------------------------
// POST (Announcement only)
// ------------------------------------------------------------
btnPost?.addEventListener("click", async () => {
  const category = String(categoryEl?.value || "").trim();
  const title = getTitle();
  const message = String(messageEl?.value || "").trim();
  const audienceType = String(audTypeEl?.value || "all").trim().toLowerCase();

  if (!category) return alert("Select category.");
  if (!title) return alert("Title required.");
  if (!message) return alert("Message required.");

  btnPost.disabled = true;
  const old = btnPost.textContent;
  btnPost.textContent = "Posting…";
  setStatus("Posting…");

  try {
    await addDoc(collection(db, "paraAnnouncements"), {
      teamId: TEAM_ID,
      category,
      title,
      message,
      pinned: false,
      archived: false,
      deleted: false,
      audienceType,          // all | parents | athletes
      createdAt: serverTimestamp(),
      from: "coach",
      fromName: "Coach"
    });

    if (categoryEl) categoryEl.value = "";
    if (titleEl) titleEl.value = "";
    if (messageEl) messageEl.value = "";

    syncCategoryTitle();

    setStatus("Posted.");
    setTimeout(() => setStatus(""), 1200);
  } catch (err) {
    console.error("Broadcast post error:", err);
    alert(err?.message || "Post failed. Check console.");
    setStatus("Post failed.");
  } finally {
    btnPost.disabled = false;
    btnPost.textContent = old || "Post";
  }
});

// ------------------------------------------------------------
// Archived toggle
// ------------------------------------------------------------
toggleArchivedBtn?.addEventListener("click", () => {
  showArchived = !showArchived;
  updateArchivedToggleLabel();
  renderFeed();
});

// ------------------------------------------------------------
// FEED (Admin) + Controls (Shared style)
// ------------------------------------------------------------
function renderFeed() {
  if (!feedEl) return;

  const visible = annItems.filter((x) => {
    if (x.teamId !== TEAM_ID) return false;
    if (x.deleted === true) return false;

    if (showArchived) return true;
    return x.archived !== true;
  });

  const sorted = sortPinnedThenNewest(visible);

  if (!sorted.length) {
    feedEl.innerHTML = `<div style="opacity:.75;padding:10px 0;">No broadcasts yet.</div>`;
    return;
  }

  feedEl.innerHTML = sorted.map((item) => {
    const card = renderAnnouncementCard(item, {
      showTeam: true,
      showAudience: true,
      showPinned: true,
      showCategory: true
    });

    return `
      <div class="admin-ann-wrap" data-id="${item.id}">
        ${card}
        <div class="meta-line" style="margin-top:-10px;margin-bottom:14px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-dark btn-sm" data-act="pin" data-id="${item.id}">
            ${item.pinned === true ? "Unpin" : "Pin"}
          </button>

          <button class="btn btn-dark btn-sm" data-act="edit" data-id="${item.id}">
            Edit
          </button>

          ${
            item.archived === true
              ? `<button class="btn btn-dark btn-sm" data-act="unarchive" data-id="${item.id}">Unarchive</button>`
              : `<button class="btn btn-dark btn-sm" data-act="archive" data-id="${item.id}">Archive</button>`
          }

          <button class="btn btn-dark btn-sm" data-act="delete" data-id="${item.id}">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join("");

  feedEl.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (!act || !id) return;

      try {
        if (act === "pin") {
          const item = annItems.find((x) => x.id === id);
          if (!item) return;
          const next = item.pinned !== true;

          await updateDoc(doc(db, "paraAnnouncements", id), {
            pinned: next,
            ...(next ? { pinnedAt: serverTimestamp() } : { unpinnedAt: serverTimestamp() })
          });
        }

        if (act === "archive") {
          if (!confirm("Archive this announcement?")) return;
          await updateDoc(doc(db, "paraAnnouncements", id), {
            archived: true,
            archivedAt: serverTimestamp()
          });
        }

        if (act === "unarchive") {
          await updateDoc(doc(db, "paraAnnouncements", id), {
            archived: false,
            unarchivedAt: serverTimestamp()
          });
        }

        if (act === "delete") {
          if (!confirm("Delete this announcement? (soft delete)")) return;
          await updateDoc(doc(db, "paraAnnouncements", id), {
            deleted: true,
            deletedAt: serverTimestamp()
          });
        }

        if (act === "edit") {
          const item = annItems.find((x) => x.id === id);
          if (!item) return;

          const nextTitle = prompt("Edit title:", item.title || "") ?? null;
          if (nextTitle === null) return;

          const nextMsg = prompt("Edit message:", item.message || "") ?? null;
          if (nextMsg === null) return;

          await updateDoc(doc(db, "paraAnnouncements", id), {
            title: String(nextTitle).trim() || "(no title)",
            message: String(nextMsg),
            editedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.error("[broadcast] action failed:", e);
        alert("Action failed. Check console.");
      }
    });
  });
}

// ------------------------------------------------------------
// Listener (V1-safe: newest 60, then filter/sort client-side)
// ------------------------------------------------------------
onSnapshot(
  query(
    collection(db, "paraAnnouncements"),
    orderBy("createdAt", "desc"),
    limit(60)
  ),
  (snap) => {
    annItems = [];
    snap.forEach((d) => annItems.push({ id: d.id, ...d.data() }));
    renderFeed();
  },
  (err) => {
    console.error("[broadcast] snapshot error:", err);
    if (feedEl) {
      feedEl.innerHTML = `<div style="opacity:.75;padding:10px 0;">Error loading broadcasts.</div>`;
    }
  }
);