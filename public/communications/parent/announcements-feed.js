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
  renderAnnouncementCard,
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
        feedEl.innerHTML = "";

        if (emptyEl) {
          emptyEl.style.display =
            "block";
        }

        return;
      }

      if (emptyEl) {
        emptyEl.style.display =
          "none";
      }

      feedEl.innerHTML =
        sorted
          .map((item) =>
            renderAnnouncementCard(
              item,
              {
                showCategory: true,
                showPinned: true
              }
            )
          )
          .join("");
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
          ? `${disciplineLabel(currentDiscipline)} announcements`
          : "Team announcements";
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