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
  auth,
  ensureSignedIn,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  doc
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

async function readAthlete(
  athleteUid
) {
  if (!athleteUid) {
    return null;
  }

  const athleteSnap =
    await getDoc(
      doc(
        db,
        "athletes",
        athleteUid
      )
    );

  if (!athleteSnap.exists()) {
    return null;
  }

  return {
    athleteUid,
    ...(athleteSnap.data() || {})
  };
}

async function resolveLinkedAthlete() {
  const parentUid =
    auth.currentUser?.uid || "";

  if (!parentUid) {
    throw new Error(
      "Parent sign-in required."
    );
  }

  const requestedAthleteUid =
    getRequestedAthleteUid();

  /*
    Prefer the athlete explicitly passed in the URL.
  */
  if (requestedAthleteUid) {
    const exactLinkQuery =
      query(
        collection(
          db,
          "parentAthleteLinks"
        ),
        where(
          "parentUid",
          "==",
          parentUid
        ),
        where(
          "athleteUid",
          "==",
          requestedAthleteUid
        )
      );

    const exactLinkSnap =
      await getDocs(
        exactLinkQuery
      );

    if (!exactLinkSnap.empty) {
      const athlete =
        await readAthlete(
          requestedAthleteUid
        );

      if (athlete) {
        return athlete;
      }

      return {
        athleteUid:
          requestedAthleteUid,
        ...(
          exactLinkSnap.docs[0]
            .data() || {}
        )
      };
    }
  }

  /*
    Otherwise, use the first linked athlete.
  */
  const linksQuery =
    query(
      collection(
        db,
        "parentAthleteLinks"
      ),
      where(
        "parentUid",
        "==",
        parentUid
      )
    );

  const linksSnap =
    await getDocs(linksQuery);

  if (!linksSnap.empty) {
    const linkData =
      linksSnap.docs[0]
        .data() || {};

    const athleteUid =
      String(
        linkData.athleteUid || ""
      )
        .trim()
        .toUpperCase();

    const athlete =
      await readAthlete(
        athleteUid
      );

    return {
      ...linkData,
      ...athlete,
      athleteUid
    };
  }

  /*
    Legacy fallback:
    Find an athlete carrying parentUid directly.
  */
  const legacyQuery =
    query(
      collection(
        db,
        "athletes"
      ),
      where(
        "parentUid",
        "==",
        parentUid
      ),
      limit(1)
    );

  const legacySnap =
    await getDocs(
      legacyQuery
    );

  if (!legacySnap.empty) {
    const athleteDoc =
      legacySnap.docs[0];

    return {
      athleteUid:
        athleteDoc.id,
      ...(athleteDoc.data() || {})
    };
  }

  return null;
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