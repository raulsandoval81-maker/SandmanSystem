// /athletes/bulletin/archive.js
// Read-only archive feed for old announcements

import {
  db,
  ensureSignedIn,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "/assets/js/firebase-init-para.js";

import {
  renderAnnouncementCard,
  sortPinnedThenNewest
} from "/para/shared/announcements-ui.js";

await ensureSignedIn();

const TEAM_ID = "law";

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");

function setStatus(msg = "") {
  if (statusEl) statusEl.textContent = msg;
}

function showError(msg) {
  if (feedEl) {
    feedEl.innerHTML = `<div class="card" style="opacity:.75;">${msg}</div>`;
  }
  if (emptyEl) emptyEl.style.display = "none";
}

if (!feedEl) {
  throw new Error("Archive feed container not found.");
}

const qRef = query(
  collection(db, "paraAnnouncements"),
  orderBy("createdAt", "desc"),
  limit(100)
);

onSnapshot(
  qRef,
  (snap) => {
    const items = [];

    snap.forEach((d) => {
      const x = d.data() || {};
      if (x.teamId !== TEAM_ID) return;
      if (x.deleted === true) return;
      if (x.archived !== true) return;

      items.push({ id: d.id, ...x });
    });

    const sorted = sortPinnedThenNewest(items);

    if (!sorted.length) {
      feedEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      setStatus("");
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    feedEl.innerHTML = sorted.map((item) =>
      renderAnnouncementCard(item, {
        showTeam: true,
        showAudience: true,
        showPinned: true,
        showCategory: true
      })
    ).join("");

    setStatus(`Showing ${sorted.length} archived announcement${sorted.length === 1 ? "" : "s"}.`);
  },
  (err) => {
    console.error("[announcement archive] snapshot error:", err);
    showError("Error loading archive.");
    setStatus("Archive failed to load.");
  }
);