// /communications/parent/announcements-feed.js
// ------------------------------------------------------------
// Parent Announcements Feed
//
// Reads:
//   paraAnnouncements
//
// Audience:
//   all | parents
//
// Scope:
//   all
//   discipline
//
// Discipline is resolved from the linked athlete so parents only
// see announcements relevant to that athlete's program.
// ------------------------------------------------------------

import {
  db,
  functions,
  httpsCallable,
  ensureSignedIn,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

import {
  esc,
  safeDate,
  getAnnIcon,
  scopeLabel,
  sortPinnedThenNewest
} from "/communications/shared/announcements-ui.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const TEAM_ID = "law";
const FEED_LIMIT = 80;

/* =========================
   DOM
========================= */

const feedEl =
  document.getElementById("feed");

const emptyEl =
  document.getElementById("empty");

const bulletinMoreWrap =
  document.getElementById(
    "bulletin-more-wrap"
  );

const bulletinMoreBtn =
  document.getElementById(
    "bulletin-more-btn"
  );

const scopeLabelEl =
  document.getElementById(
    "announcement-scope"
  );
const getMyAthleteCall =
  httpsCallable(functions, "getMyAthlete");
/* =========================
   STATE
========================= */

let currentAthleteUid = "";
let currentDiscipline = "";

let currentAnnouncements = [];
let showAllAnnouncements = false;

const INITIAL_VISIBLE = 3;

/* =========================
   HELPERS
========================= */

function showError(message) {
  if (feedEl) {
    feedEl.innerHTML = `
      <div
        class="card"
        style="opacity:.75;"
      >
        ${escapeHtml(message)}
      </div>
    `;
  }

  if (emptyEl) {
    emptyEl.style.display = "none";
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

  return (
    labels[normalized] ||
    "All Disciplines"
  );
}

function getRequestedAthleteUid() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return String(
    params.get("athleteUid") ||
    params.get("id") ||
    localStorage.getItem(
      "currentAthleteId"
    ) ||
    sessionStorage.getItem(
      "currentAthleteId"
    ) ||
    ""
  )
    .trim()
    .toUpperCase();
}

function getAthleteDiscipline(
  athlete = {}
) {
  return normalizeDiscipline(
    athlete.activeDiscipline ||
    athlete.primaryDiscipline ||
    athlete.discipline ||
    athlete.sport ||
    athlete.art ||
    athlete.programInterest ||
    athlete.trackDiscipline ||
    ""
  );
}

/* =========================
   ATHLETE RESOLUTION
========================= */

async function resolveLinkedAthlete() {
  const result =
    await getMyAthleteCall({});

  const data =
    result?.data || {};

  if (
    data.ok !== true ||
    data.linked !== true
  ) {
    return null;
  }

  const athletes =
    Array.isArray(data.athletes)
      ? data.athletes
      : [];

  const requestedAthleteUid =
    getRequestedAthleteUid();

  let athlete = null;

  if (requestedAthleteUid) {
    athlete = athletes.find((item) => {
      const uid =
        String(
          item.athleteUid ||
          item.id ||
          item.uid ||
          ""
        )
          .trim()
          .toUpperCase();

      return (
        uid ===
        requestedAthleteUid
      );
    });
  }

  if (!athlete) {
    athlete =
      data.athlete ||
      athletes[0] ||
      null;
  }

  if (!athlete) {
    return null;
  }

  const athleteUid =
    String(
      athlete.athleteUid ||
      athlete.id ||
      athlete.uid ||
      requestedAthleteUid ||
      ""
    )
      .trim()
      .toUpperCase();

  if (!athleteUid) {
    return null;
  }

  return {
    ...athlete,
    athleteUid
  };
}

/* =========================
   ANNOUNCEMENT FILTER
========================= */

function isVisibleAnnouncement(
  item = {}
) {
  if (
    item.teamId &&
    item.teamId !== TEAM_ID
  ) {
    return false;
  }

  if (item.archived === true) {
    return false;
  }

  if (item.deleted === true) {
    return false;
  }

  const audience =
    String(
      item.audienceType || "all"
    )
      .trim()
      .toLowerCase();

  if (
    audience !== "all" &&
    audience !== "parents"
  ) {
    return false;
  }

  const scope =
    String(
      item.scope || "all"
    )
      .trim()
      .toLowerCase();

  /*
    Legacy announcements without a scope are
    treated as all-discipline announcements.
  */
  if (
    !scope ||
    scope === "all"
  ) {
    return true;
  }

  if (scope === "discipline") {
    const announcementDiscipline =
      normalizeDiscipline(
        item.discipline || ""
      );

    return Boolean(
      currentDiscipline &&
      announcementDiscipline ===
        currentDiscipline
    );
  }

  return true;
}


function compactDate(timestamp) {
  const raw = safeDate(timestamp);
  if (!raw) return "";

  try {
    const date =
      typeof timestamp?.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    if (
      !(date instanceof Date) ||
      Number.isNaN(date.getTime())
    ) {
      return raw;
    }

    return date.toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  } catch {
    return raw;
  }
}

function renderBulletinItem(
  item = {},
  index = 0
) {
  const pinned =
    item.pinned === true;

  const icon =
    getAnnIcon(item);

  const scope =
    scopeLabel(item);

  const category =
    String(
      item.category || ""
    ).trim();

  const date =
    compactDate(
      item.createdAt
    );

  const open =
    index === 0 &&
    pinned;

  return `
    <details
      class="bulletin-row ${pinned ? "pinned" : ""}"
      ${open ? "open" : ""}
    >
      <summary class="bulletin-summary">
        <span class="bulletin-summary-main">
          <span class="bulletin-title">
            <span>${esc(icon)}</span>
            <span>
              ${esc(
                item.title ||
                "Announcement"
              )}
            </span>
          </span>

          <span class="bulletin-meta">
            ${
              category
                ? `<span>${esc(category)}</span>`
                : ""
            }

            <span>
              ${esc(scope)}
            </span>

            ${
              date
                ? `<span>${esc(date)}</span>`
                : ""
            }
          </span>
        </span>

        <span
          style="
            display:flex;
            align-items:center;
            gap:8px;
          "
        >
          ${
            pinned
              ? `
                <span class="bulletin-pin">
                  Important
                </span>
              `
              : ""
          }

          <span
            class="bulletin-chevron"
            aria-hidden="true"
          >
            ›
          </span>
        </span>
      </summary>

      <div class="bulletin-detail">
        <p class="bulletin-message">
          ${esc(
            item.message || ""
          )}
        </p>
      </div>
    </details>
  `;
}

function renderBulletinFeed() {
  if (!feedEl) return;

  const visible =
    showAllAnnouncements
      ? currentAnnouncements
      : currentAnnouncements.slice(
          0,
          INITIAL_VISIBLE
        );

  feedEl.innerHTML =
    visible
      .map(renderBulletinItem)
      .join("");

  if (
    bulletinMoreWrap &&
    bulletinMoreBtn
  ) {
    const hasMore =
      currentAnnouncements.length >
      INITIAL_VISIBLE;

    bulletinMoreWrap.hidden =
      !hasMore;

    if (hasMore) {
      const remaining =
        Math.max(
          0,
          currentAnnouncements.length -
          INITIAL_VISIBLE
        );

      bulletinMoreBtn.textContent =
        showAllAnnouncements
          ? "Show Less"
          : `Show ${remaining} More`;
    }
  }
}

bulletinMoreBtn?.addEventListener(
  "click",
  () => {
    showAllAnnouncements =
      !showAllAnnouncements;

    renderBulletinFeed();
  }
);

/* =========================
   FEED
========================= */

function startFeed() {
  const feedQuery =
    query(
      collection(
        db,
        "paraAnnouncements"
      ),
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(FEED_LIMIT)
    );

  onSnapshot(
    feedQuery,
    (snapshot) => {
      if (!feedEl) {
        return;
      }

      const items =
        snapshot.docs.map(
          (document) => ({
            id: document.id,
            ...(document.data() || {})
          })
        );

      const visible =
        items.filter(
          isVisibleAnnouncement
        );

      const sorted =
        sortPinnedThenNewest(
          visible
        );

      if (!sorted.length) {
        currentAnnouncements = [];
        feedEl.innerHTML = "";

        if (emptyEl) {
          emptyEl.style.display =
            "block";
        }

        if (bulletinMoreWrap) {
          bulletinMoreWrap.hidden =
            true;
        }

        return;
      }

      if (emptyEl) {
        emptyEl.style.display =
          "none";
      }

      currentAnnouncements =
        sorted;

      showAllAnnouncements =
        false;

      renderBulletinFeed();
    },
    (error) => {
      console.error(
        "[parent announcements] snapshot error:",
        error
      );

      showError(
        "Error loading announcements."
      );
    }
  );
}

/* =========================
   BOOT
========================= */

async function boot() {
  try {
    const athlete =
      await resolveLinkedAthlete();

    if (!athlete?.athleteUid) {
      showError(
        "No athlete is linked to this parent account."
      );

      return;
    }

    currentAthleteUid =
      String(
        athlete.athleteUid || ""
      )
        .trim()
        .toUpperCase();

    currentDiscipline =
      getAthleteDiscipline(
        athlete
      );

    localStorage.setItem(
      "currentAthleteId",
      currentAthleteUid
    );

    if (scopeLabelEl) {
      scopeLabelEl.textContent =
        currentDiscipline
          ? `For ${disciplineLabel(currentDiscipline)}`
          : "For your family";
    }

    startFeed();
  } catch (error) {
    console.error(
      "[parent announcements] boot failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to load announcements."
    );
  }
}

await boot();