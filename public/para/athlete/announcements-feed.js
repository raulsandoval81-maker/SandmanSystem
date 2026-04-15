// /coach/para/athlete/announcements-feed.js
// Athlete feed (read-only) — V1-safe
// - HARD REQUIRE AUTH (no silent catch)
// - Simple query (no composite index drama)
// - Client-side filters: teamId, audienceType, archived/deleted
// - Sort: pinned first then newest (shared)
// - NEW: supports kind:"lane" cards (Strength/Honor assignments)
// - NEW: optional ATHLETE_ID filter via ?id=F4_0001 for lane cards

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

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");

const TEAM_ID = "law";

// Optional: athlete id for filtering lane cards
const params = new URLSearchParams(location.search);
const ATHLETE_ID = (params.get("id") || "").trim().toUpperCase();

function showError(msg) {
  if (feedEl) feedEl.innerHTML = `<div class="card" style="opacity:.75;">${msg}</div>`;
  if (emptyEl) emptyEl.style.display = "none";
}

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isLaneCard(x) {
  return String(x?.kind || "").trim().toLowerCase() === "lane";
}

function renderLaneCard(x) {
  const lane = String(x?.lane || "").trim().toUpperCase();
  const title = x?.title || `${lane || "LANE"} Assignment`;
  const sub = x?.sub || "";
  const dateKey = x?.dateKey || "";

  // Prefer explicit href; fallback builds from lane + athleteId + sessionN
  const aid = String(x?.athleteId || "").trim().toUpperCase();
  const sessionN = Number(x?.sessionN || x?.n || 0) || null;

  let href = String(x?.href || "").trim();
  if (!href && lane && aid) {
    const lanePath = (lane.toLowerCase() === "honor")
      ? "/athletes/lanes/honor/"
      : "/athletes/lanes/strength/";
    href = `${lanePath}?id=${encodeURIComponent(aid)}${sessionN ? `&n=${encodeURIComponent(sessionN)}` : ""}`;
  }
  if (!href) href = "#";

  return `
    <div class="card" style="border:1px solid #27304a;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div style="min-width:0;">
          <div style="font-weight:900;color:#ffdd48;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${esc(title)}
          </div>
          ${sub ? `<div style="opacity:.8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(sub)}</div>` : ``}
          ${dateKey ? `<div style="opacity:.6;margin-top:4px;font-size:.9rem;">${esc(dateKey)}</div>` : ``}
        </div>
        <a class="btn" href="${esc(href)}" style="white-space:nowrap;">Open</a>
      </div>
    </div>
  `;
}

try {
  await ensureSignedIn();
} catch (e) {
  console.error("[ann] ensureSignedIn failed:", e);
  if (feedEl) feedEl.innerHTML = `<div class="card" style="opacity:.75;">Sign-in required. Refresh.</div>`;
  if (emptyEl) emptyEl.style.display = "none";
  throw e;
}

// ✅ Simple query: no where(), no in(), no archived/deleted filters at query-level
const qRef = query(
  collection(db, "paraAnnouncements"),
  orderBy("createdAt", "desc"),
  limit(80)
);

onSnapshot(qRef, (snap) => {
  if (!feedEl) return;

  const items = [];
  snap.forEach((ds) => items.push({ id: ds.id, ...(ds.data() || {}) }));

  // ✅ Filter client-side (V1-safe)
  const visible = items.filter((x) => {
    if (x.teamId !== TEAM_ID) return false;
    if (x.archived === true) return false;
    if (x.deleted === true) return false;

    const aud = String(x.audienceType || "all").toLowerCase();
    if (!(aud === "all" || aud === "athletes")) return false;

    // ✅ Lane cards: if ATHLETE_ID exists, only show cards targeted to that athlete
    if (isLaneCard(x) && ATHLETE_ID) {
      const target = String(x.athleteId || "").trim().toUpperCase();
      if (target && target !== ATHLETE_ID) return false;
    }

    return true;
  });

  const sorted = sortPinnedThenNewest(visible);

  if (!sorted.length) {
    feedEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  feedEl.innerHTML = sorted
    .map((d) => (isLaneCard(d) ? renderLaneCard(d) : renderAnnouncementCard(d)))
    .join("");

}, (err) => {
  console.error("[athlete announcements] snapshot error:", err);
  showError("Error loading announcements.");
});