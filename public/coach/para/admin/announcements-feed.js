// /coach/para/admin/announcement-feed.js
// Admin announcements feed + controls (LAW)
// - Uses shared UI renderer so style matches parent/athlete
// - Admin actions: PIN / EDIT / ARCHIVE / DELETE (soft)
// - Collection: paraAnnouncements

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
} from "/coach/shared/announcements-ui.js";

// ✅ do NOT swallow auth failures
try {
  await ensureSignedIn();
} catch (e) {
  console.error("[ann] ensureSignedIn failed:", e);
  if (feedEl) feedEl.innerHTML = `<div class="card" style="opacity:.75;">Sign-in required. Refresh.</div>`;
  if (emptyEl) emptyEl.style.display = "none";
  throw e;
}
// -------------------------
const TEAM_ID = "law";

// DOM
const feedEl   = document.getElementById("bc-feed") || document.getElementById("feed");
const emptyEl  = document.getElementById("empty");
const statusEl = document.getElementById("bc-status") || document.getElementById("status");

function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
}

// V1-safe: pull newest 80 then filter + pinned sort client-side
const qRef = query(
  collection(db, "paraAnnouncements"),
  orderBy("createdAt", "desc"),
  limit(80)
);

function renderAdminCard(item) {
  const base = renderAnnouncementCard(item, {
    showTeam: true,
    showAudience: true,
    showPinned: true,
    showCategory: true
  });

  return `
    <div class="admin-ann-wrap" data-id="${item.id}" data-pinned="${item.pinned === true ? "true" : "false"}">
      ${base}
      <div class="meta-line" style="margin-top:-10px;margin-bottom:14px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-dark btn-sm" data-act="pin" data-id="${item.id}">
          ${item.pinned === true ? "Unpin" : "Pin"}
        </button>
        <button class="btn btn-dark btn-sm" data-act="edit" data-id="${item.id}">Edit</button>
        <button class="btn btn-dark btn-sm" data-act="archive" data-id="${item.id}">Archive</button>
        <button class="btn btn-dark btn-sm" data-act="delete" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

function bindAdminActions() {
  if (!feedEl) return;

  feedEl.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id  = btn.getAttribute("data-id");
      if (!act || !id) return;

      try {
        if (act === "pin") {
          const wrap = feedEl.querySelector(`.admin-ann-wrap[data-id="${CSS.escape(id)}"]`);
          const pinnedNow = wrap?.getAttribute("data-pinned") === "true";
          const next = !pinnedNow;

          await updateDoc(doc(db, "paraAnnouncements", id), {
            pinned: next,
            ...(next ? { pinnedAt: serverTimestamp() } : { unpinnedAt: serverTimestamp() })
          });

          setStatus(next ? "Pinned." : "Unpinned.");
          setTimeout(() => setStatus(""), 1000);
        }

        if (act === "archive") {
          if (!confirm("Archive this announcement?")) return;
          await updateDoc(doc(db, "paraAnnouncements", id), {
            archived: true,
            archivedAt: serverTimestamp()
          });
          setStatus("Archived.");
          setTimeout(() => setStatus(""), 1000);
        }

        if (act === "delete") {
          if (!confirm("Delete this announcement? (soft delete)")) return;
          await updateDoc(doc(db, "paraAnnouncements", id), {
            deleted: true,
            deletedAt: serverTimestamp()
          });
          setStatus("Deleted.");
          setTimeout(() => setStatus(""), 1000);
        }

        if (act === "edit") {
          const nextTitle = prompt("Edit title:") ?? null;
          if (nextTitle === null) return;

          const nextMsg = prompt("Edit message:") ?? null;
          if (nextMsg === null) return;

          await updateDoc(doc(db, "paraAnnouncements", id), {
            title: String(nextTitle).trim() || "(no title)",
            message: String(nextMsg),
            editedAt: serverTimestamp()
          });
          setStatus("Edited.");
          setTimeout(() => setStatus(""), 1000);
        }
      } catch (e) {
        console.error("[admin announcements] action failed:", e);
        alert("Action failed. Check console.");
        setStatus("Action failed.");
        setTimeout(() => setStatus(""), 1200);
      }
    });
  });
}

onSnapshot(qRef, (snap) => {
  if (!feedEl) return;

  const items = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    if (x.teamId !== TEAM_ID) return;
    if (x.archived === true) return;
    if (x.deleted === true) return;
    items.push({ id: d.id, ...x });
  });

  const sorted = sortPinnedThenNewest(items);

  if (!sorted.length) {
    feedEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  feedEl.innerHTML = sorted.map(renderAdminCard).join("");
  bindAdminActions();
}, (err) => {
  console.error("[admin announcements] snapshot error:", err);
  if (feedEl) feedEl.innerHTML = `<div class="card" style="opacity:.75;">Error loading announcements.</div>`;
  if (emptyEl) emptyEl.style.display = "none";
});