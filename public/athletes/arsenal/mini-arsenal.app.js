import {
  db,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

const homeBtn = $("homeBtn");
const athleteLabel = $("athleteLabel");
const panelEyebrow = $("panelEyebrow");
const panelTitle = $("panelTitle");
const panelText = $("panelText");
const badgeWall = $("badgeWall");

const params =
  new URLSearchParams(window.location.search);

const athleteId = String(
  params.get("athleteId") ||
  params.get("id") ||
  localStorage.getItem("currentAthleteId") ||
  sessionStorage.getItem("currentAthleteId") ||
  ""
)
  .trim()
  .toUpperCase();

let athlete = null;
let activeDiscipline = "wrestling";

/* =========================
   HELPERS
========================= */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeDiscipline(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (raw.includes("box")) {
    return "boxing";
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

  return raw;
}

function disciplineLabel(value = "") {
  const labels = {
    wrestling: "Wrestling",
    kickboxing: "Kickboxing",
    boxing: "Boxing",
    mma: "MMA",
    "submission-grappling":
      "Submission Grappling"
  };

  const normalized =
    normalizeDiscipline(value);

  return (
    labels[normalized] ||
    normalized
      .split("-")
      .filter(Boolean)
      .map((part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
      )
      .join(" ") ||
    "Combat"
  );
}

function disciplineIdsOf(data = {}) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(data.disciplineIds)
          ? data.disciplineIds
          : []),

        ...Object.keys(
          data.disciplines || {}
        ),

        data.activeDiscipline,
        data.primaryDiscipline,
        data.discipline,
        data.art,
        data.sport
      ]
        .map(normalizeDiscipline)
        .filter(Boolean)
    )
  );
}

function resolveActiveDiscipline(
  data = {},
  requested = ""
) {
  const allowed =
    disciplineIdsOf(data);

  const wanted =
    normalizeDiscipline(requested);

  if (
    wanted &&
    allowed.includes(wanted)
  ) {
    return wanted;
  }

  const preferred =
    normalizeDiscipline(
      data.activeDiscipline ||
      data.primaryDiscipline ||
      data.discipline ||
      data.art ||
      data.sport ||
      ""
    );

  if (
    preferred &&
    allowed.includes(preferred)
  ) {
    return preferred;
  }

  return allowed[0] || "wrestling";
}

function renderEmpty(message) {
  if (!badgeWall) return;

  badgeWall.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function normalizeBadgeLabel(
  item,
  fallback = "Earned Badge"
) {
  if (typeof item === "string") {
    return item;
  }

  if (
    !item ||
    typeof item !== "object"
  ) {
    return fallback;
  }

  return (
    item.title ||
    item.label ||
    item.name ||
    item.badgeName ||
    fallback
  );
}

function renderBadges(
  items,
  emptyMessage = "No badges to show yet."
) {
  if (!badgeWall) return;

  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    renderEmpty(emptyMessage);
    return;
  }

  badgeWall.innerHTML =
    items
      .slice(0, 24)
      .map((item, index) => {
        const label =
          normalizeBadgeLabel(
            item,
            `Earned Badge ${index + 1}`
          );

        return `
          <div class="badge-chip">
            ${escapeHtml(label)}
          </div>
        `;
      })
      .join("");
}

/* =========================
   PANELS
========================= */

function getYouthCombatRoute(
  discipline = ""
) {
  const normalized =
    normalizeDiscipline(discipline);

  const routes = {
    wrestling:
      "/athletes/arsenal/combat/z2h/wrestling/index.html",

    kickboxing:
      "/athletes/arsenal/combat/z2h/kickboxing/index.html",

    /*
      Foundry 8 Boxing remains a future pathway.
      Do not route athletes into an active Boxing Arsenal yet.
    */
    boxing: null,

    mma: null,

    "submission-grappling": null
  };

  return routes[normalized] || null;
}

function showCombatPanel() {
  if (
    !panelEyebrow ||
    !panelTitle ||
    !panelText
  ) {
    return;
  }

  const label =
    disciplineLabel(activeDiscipline);

  panelEyebrow.textContent =
    "Combat Arsenal";

  panelTitle.textContent =
    label;

  panelText.textContent =
    `${label} skills, tools, and development resources.`;

  renderEmpty(
    `Open the ${label} Combat Arsenal to continue.`
  );
}

function openCombat() {
  if (!athleteId) return;

  const route =
    getYouthCombatRoute(
      activeDiscipline
    );

  if (!route) {
    console.warn(
      "Youth Combat Arsenal unavailable:",
      {
        athleteId,
        activeDiscipline
      }
    );

    renderEmpty(
      `${disciplineLabel(activeDiscipline)} is not available yet.`
    );

    return;
  }

  const query =
    new URLSearchParams();

  query.set("id", athleteId);
  query.set(
    "discipline",
    activeDiscipline
  );

  window.location.href =
    `${route}?${query.toString()}`;
}

function openStrength() {
  if (
    !panelEyebrow ||
    !panelTitle ||
    !panelText
  ) {
    return;
  }

  panelEyebrow.textContent =
    "Acts of Strength";

  panelTitle.textContent =
    "Acts of Strength";

  panelText.textContent =
    "Coach-recognized moments of effort, toughness, and discipline.";

  const items =
    athlete?.actsOfStrength || [];

  renderBadges(
    items,
    "No Acts of Strength badges earned yet."
  );
}

function openHonor() {
  if (
    !panelEyebrow ||
    !panelTitle ||
    !panelText
  ) {
    return;
  }

  panelEyebrow.textContent =
    "Acts of Honor";

  panelTitle.textContent =
    "Acts of Honor";

  panelText.textContent =
    "Coach-recognized moments of respect, character, and leadership.";

  const items =
    athlete?.actsOfHonor || [];

  renderBadges(
    items,
    "No Acts of Honor badges earned yet."
  );
}

function wireCards() {
  $("combatCard")
    ?.addEventListener(
      "click",
      openCombat
    );

  $("strengthCard")
    ?.addEventListener(
      "click",
      openStrength
    );

  $("honorCard")
    ?.addEventListener(
      "click",
      openHonor
    );
}

/* =========================
   LOAD
========================= */

async function loadAthlete() {
  if (!athleteId) {
    if (athleteLabel) {
      athleteLabel.textContent =
        "No athlete ID provided.";
    }

    renderEmpty(
      "Missing athlete ID."
    );

    return;
  }

  // Youth Arsenal only.
  if (!athleteId.startsWith("F8_")) {
    window.location.replace(
      `/athletes/arsenal/arsenal.html` +
      `?id=${encodeURIComponent(athleteId)}`
    );

    return;
  }

  try {
    await ensureSignedIn();

    const athleteRef =
      doc(
        db,
        "athletes",
        athleteId
      );

    const athleteSnap =
      await getDoc(athleteRef);

    if (!athleteSnap.exists()) {
      console.error(
        "Athlete not found:",
        athleteId
      );

      if (athleteLabel) {
        athleteLabel.textContent =
          athleteId;
      }

      renderEmpty(
        "Athlete not found."
      );

      return;
    }

    athlete =
      athleteSnap.data() || {};

    const requestedDiscipline =
      params.get("discipline") ||
      localStorage.getItem(
        `sandman_active_discipline_${athleteId}`
      ) ||
      "";

    activeDiscipline =
      resolveActiveDiscipline(
        athlete,
        requestedDiscipline
      );

    localStorage.setItem(
      "currentAthleteId",
      athleteId
    );

    localStorage.setItem(
      `sandman_active_discipline_${athleteId}`,
      activeDiscipline
    );

    const displayName =
      athlete.displayName ||
      athlete.athleteName ||
      athlete.publicName ||
      athlete.name ||
      athlete.fullName ||
      athleteId;

    if (athleteLabel) {
      athleteLabel.textContent =
        displayName;
    }

    if (homeBtn) {
      homeBtn.href =
        `/athletes/hub/mini-hub.html` +
        `?id=${encodeURIComponent(athleteId)}` +
        `&discipline=${encodeURIComponent(activeDiscipline)}`;
    }

    const combatCard =
      $("combatCard");

    const combatTitle =
      combatCard?.querySelector("h2");

    const combatText =
      combatCard?.querySelector("p");

    const label =
      disciplineLabel(
        activeDiscipline
      );

    if (combatTitle) {
      combatTitle.textContent =
        label;
    }

    if (combatText) {
      combatText.textContent =
        `${label} Combat Arsenal`;
    }

    // Stay on the Arsenal landing page.
    // Do not automatically redirect to Combat.
    showCombatPanel();

  } catch (err) {
    console.error(
      "mini-arsenal load failed:",
      err
    );

    if (athleteLabel) {
      athleteLabel.textContent =
        athleteId;
    }

    renderEmpty(
      "Could not load athlete."
    );
  }
}

wireCards();
await loadAthlete();