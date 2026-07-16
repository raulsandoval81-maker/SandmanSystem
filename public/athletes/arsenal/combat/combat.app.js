import {
  db,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

console.log("Combat lane loaded");

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

let activeDiscipline = "";

function normalizeDiscipline(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (raw.includes("kickbox")) return "kickboxing";
  if (raw.includes("wrest")) return "wrestling";

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (raw.includes("box")) return "boxing";

  return raw;
}

const DISCIPLINE_ROUTES = {
  wrestling: {
    youth: "/athletes/arsenal/combat/youth/index.html",
    teen: "/athletes/arsenal/combat/teen/index.html"
  },

  boxing: {
    youth: null,
    teen: "/athletes/arsenal/combat/teen/index.html"
  },

  kickboxing: {
    youth: "/athletes/arsenal/combat/youth/index.html",
    teen: null
  },

  mma: {
    youth: null,
    teen: "/athletes/arsenal/combat/teen/index.html"
  },

  "submission-grappling": {
    youth: null,
    teen: null
  }
};


function disciplineIdsOf(athlete = {}) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(athlete.disciplineIds)
          ? athlete.disciplineIds
          : []),

        ...Object.keys(athlete.disciplines || {}),

        athlete.activeDiscipline,
        athlete.primaryDiscipline,
        athlete.discipline,
        athlete.art,
        athlete.sport
      ]
        .map(normalizeDiscipline)
        .filter(Boolean)
    )
  );
}

function resolveActiveDiscipline(
  athlete = {},
  requested = ""
) {
  const allowed =
    disciplineIdsOf(athlete);

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
      athlete.activeDiscipline ||
      athlete.primaryDiscipline ||
      athlete.discipline ||
      athlete.art ||
      athlete.sport ||
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

function combatForDiscipline(
  athlete = {},
  discipline = ""
) {
  const normalized =
    normalizeDiscipline(discipline);

  return (
    athlete.disciplines?.[normalized] ||
    athlete
  );
}

function getStripeCount(combat = {}) {
  return Number(
    combat.stripeCount ??
    combat.stripesEarned ??
    combat.stripes ??
    0
  );
}

function getTierNumber(combat = {}) {
  const raw =
    combat.tier ??
    combat.tierCode ??
    combat.tierIndex ??
    combat.currentTier ??
    "T0";

  if (typeof raw === "number") {
    return raw;
  }

  const match =
    String(raw)
      .toUpperCase()
      .match(/T(\d+)/);

  if (match) {
    return Number(match[1]) || 0;
  }

  return Number(raw) || 0;
}

function withContext(url) {
  const out =
    new URLSearchParams();

  out.set("id", athleteId);

  if (activeDiscipline) {
    out.set(
      "discipline",
      activeDiscipline
    );
  }

  return `${url}?${out.toString()}`;
}

function wire(id, url) {
  const el =
    document.getElementById(id);

  if (!el) {
    console.warn("Missing element:", id);
    return;
  }

  const link =
    withContext(url);

  el.href = link;

  console.log(
    "Linked:",
    id,
    "→",
    link
  );
}

function lockCard(
  cardId,
  message = "Not available for this discipline yet."
) {
  const card =
    document.getElementById(cardId);

  if (!card) return;

  card.classList.add("locked");
  card.setAttribute(
    "aria-disabled",
    "true"
  );

  card.removeAttribute("href");

  const text =
    card.querySelector("p");

  if (text) {
    text.textContent = message;
  }
}

function unlockCard(
  cardId,
  trainId,
  studyId,
  toolUrl,
  syllabusUrl
) {
  const card =
    document.getElementById(cardId);

  if (card) {
    card.classList.remove("locked");
    card.removeAttribute(
      "aria-disabled"
    );
  }

  wire(trainId, toolUrl);
  wire(studyId, syllabusUrl);
}

async function loadCombatUnlocks() {
  if (!athleteId) {
    console.error("Missing athlete ID");
    return;
  }

  await ensureSignedIn();

  const athleteRef =
    doc(db, "athletes", athleteId);

  const athleteSnap =
    await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    console.error(
      "Athlete not found:",
      athleteId
    );

    return;
  }

  const athlete =
    athleteSnap.data() || {};

  activeDiscipline =
    resolveActiveDiscipline(
      athlete,
      params.get("discipline") ||
      localStorage.getItem(
        `sandman_active_discipline_${athleteId}`
      )
    );

  const combat =
    combatForDiscipline(
      athlete,
      activeDiscipline
    );

  localStorage.setItem(
    "currentAthleteId",
    athleteId
  );

  localStorage.setItem(
    `sandman_active_discipline_${athleteId}`,
    activeDiscipline
  );

  const stripe =
    getStripeCount(combat);

  const tier =
    getTierNumber(combat);

  console.log("Combat context:", {
    athleteId,
    activeDiscipline,
    stripe,
    tier,
    combat
  });

  /*
    Existing ShadowTrainer content is wrestling-specific.
    Never expose these links to boxing, kickboxing, or MMA.
  */
  if (activeDiscipline !== "wrestling") {
    lockCard(
      "card-v0",
      `${activeDiscipline} Combat Arsenal is being prepared.`
    );

    lockCard(
      "card-v2",
      `${activeDiscipline} Combat Arsenal is being prepared.`
    );

    return;
  }

  // Youth Wrestling begins at V0.
  if (athleteId.startsWith("F8_")) {
    unlockCard(
      "card-v0",
      "v0-train",
      "v0-study",
      "/athletes/arsenal/combat/shadowtrainer-v0-tool.html",
      "/athletes/arsenal/combat/shadowtrainer-v0-syllabus.html"
    );
  }

  // Teen/Adult Wrestling compressed entry begins at V2.
  if (
    athleteId.startsWith("F4_") &&
    (stripe >= 2 || tier >= 1)
  ) {
    unlockCard(
      "card-v2",
      "v2-train",
      "v2-study",
      "/athletes/arsenal/combat/shadowtrainer-v2-tool.html",
      "/athletes/arsenal/combat/shadowtrainer-v2-syllabus.html"
    );
  }
}

await loadCombatUnlocks();