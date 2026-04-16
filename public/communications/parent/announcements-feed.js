// /communications/parent/announcements-feed.js
// Parent feed (read-only) — V1-stable
// - HARD REQUIRE AUTH (no silent catch)
// - Simple query (no composite index)
// - Client-side filters: teamId, audienceType, archived/deleted
// - Sort: pinned first then newest (shared)

import {
  db,
  ensureSignedIn,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

import {
  renderAnnouncementCard,
  sortPinnedThenNewest
} from "/communications/shared/announcements-ui.js";

const feedEl  = document.getElementById("feed");
const emptyEl = document.getElementById("empty");

const TEAM_ID = "law";

function showError(msg) {
  if (feedEl) feedEl.innerHTML = `<div class="card" style="opacity:.75;">${msg}</div>`;
  if (emptyEl) emptyEl.style.display = "none";
}

try {
  await ensureSignedIn();
} catch (e) {
  console.error("[ann] ensureSignedIn failed:", e);
  if (feedEl) feedEl.innerHTML = `<div class="card" style="opacity:.75;">Sign-in required. Refresh.</div>`;
  if (emptyEl) emptyEl.style.display = "none";
  throw e;
}
// ✅ Simple query: no where/in filters (avoids composite indexes)
const qRef = query(
  collection(db, "paraAnnouncements"),
  orderBy("createdAt", "desc"),
  limit(80)
);

onSnapshot(qRef, (snap) => {
  if (!feedEl) return;

  const items = [];
  snap.forEach((ds) => items.push({ id: ds.id, ...(ds.data() || {}) }));

  // ✅ V1 separation enforced here
  const visible = items.filter((x) => {
    if (x.teamId !== TEAM_ID) return false;
    if (x.archived === true) return false;
    if (x.deleted === true) return false;

    const aud = String(x.audienceType || "all").toLowerCase();
    return aud === "all" || aud === "parents";
  });

  const sorted = sortPinnedThenNewest(visible);

  if (!sorted.length) {
    feedEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  feedEl.innerHTML = sorted
    .map((d) => renderAnnouncementCard(d))
    .join("");
}, (err) => {
  console.error("[parent announcements] snapshot error:", err);
  showError("Error loading announcements.");
});