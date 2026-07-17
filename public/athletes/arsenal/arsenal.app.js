import {
  db,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

function setLocked(card, title, desc) {
  if (!card) return;

  card.classList.add("locked");
  card.removeAttribute("href");
  card.setAttribute("aria-disabled", "true");

  const h2 = card.querySelector("h2");
  const p = card.querySelector("p");

  if (h2) h2.textContent = title;
  if (p) p.textContent = desc;
}

function setOpen(card, title, desc, href) {
  if (!card) return;

  card.classList.remove("locked");
  card.setAttribute("href", href);
  card.removeAttribute("aria-disabled");

  const h2 = card.querySelector("h2");
  const p = card.querySelector("p");

  if (h2) h2.textContent = title;
  if (p) p.textContent = desc;
}

function normalizeDiscipline(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (raw.includes("kickbox")) return "kickboxing";

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

  if (raw.includes("wrest")) return "wrestling";
  if (raw.includes("box")) return "boxing";

  return raw;
}

function disciplineLabel(value = "") {
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    mma: "MMA",
    "submission-grappling": "Submission Grappling"
  };

  const normalized = normalizeDiscipline(value);

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

function disciplineIdsOf(athlete = {}) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(athlete.disciplineIds)
          ? athlete.disciplineIds
          : []),

        ...Object.keys(
          athlete.disciplines || {}
        ),

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
  const allowed = disciplineIdsOf(athlete);

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

function getTrackCode(
  athleteId,
  athlete = {},
  combat = {}
) {
  const raw = String(
    combat.trackCode ??
    combat.track ??
    combat.programTrack ??
    combat.journey ??
    athlete.trackCode ??
    athlete.track ??
    athlete.programTrack ??
    athlete.journey ??
    ""
  )
    .trim()
    .toUpperCase();

  if (
    athleteId.startsWith("F8_") ||
    raw.includes("F8") ||
    raw.includes("FOUNDRY8") ||
    raw.includes("ZERO2HERO") ||
    raw.includes("Z2H")
  ) {
    return "F8";
  }

  if (
    athleteId.startsWith("F4_") ||
    raw.includes("F4") ||
    raw.includes("FOUNDRY4") ||
    raw.includes("PATH2LEGEND") ||
    raw.includes("P2L")
  ) {
    return "F4";
  }

  return "";
}

function isF8Athlete(
  athleteId,
  athlete = {},
  combat = {}
) {
  return (
    getTrackCode(
      athleteId,
      athlete,
      combat
    ) === "F8"
  );
}

function isLegacyAthlete(athlete = {}) {
  return (
    athlete.legacyAthlete === true ||
    athlete.legacy === true
  );
}

function wireNavigation(
  athleteId,
  discipline
) {
  const encodedId =
    encodeURIComponent(athleteId);

  const encodedDiscipline =
    encodeURIComponent(discipline);

  const homeLink =
    document.getElementById("homeLink");

  if (homeLink) {
    homeLink.href =
      `/athletes/hub/full-hub.html` +
      `?id=${encodedId}` +
      `&discipline=${encodedDiscipline}`;
  }

  const bulletinLink =
    document.getElementById("bulletinLink");

  if (bulletinLink) {
    bulletinLink.href =
      `/athletes/bulletin/index.html` +
      `?id=${encodedId}` +
      `&discipline=${encodedDiscipline}`;
  }

  const leaderboardLink =
    document.getElementById("leaderboardLink");

  if (leaderboardLink) {
    leaderboardLink.href =
      `/athletes/leaderboard/` +
      `?id=${encodedId}` +
      `&discipline=${encodedDiscipline}`;
  }
}

async function loadUnlocks() {
  const combatCard =
    document.getElementById("combat-card");

  const strengthCard =
    document.getElementById("strength-card");

  const honorCard =
    document.getElementById("honor-card");

  const params =
    new URLSearchParams(
      window.location.search
    );

  const athleteId = String(
    params.get("athleteId") ||
    params.get("id") ||
    localStorage.getItem("currentAthleteId") ||
    sessionStorage.getItem("currentAthleteId") ||
    ""
  )
    .trim()
    .toUpperCase();

  if (!athleteId) {
    console.error(
      "Missing athlete ID in Arsenal URL"
    );

    return;
  }

  setLocked(
    combatCard,
    "Combat",
    "Loading combat access..."
  );

  setLocked(
    strengthCard,
    "Strength 🔒",
    "Loading Strength access..."
  );

  setLocked(
    honorCard,
    "Honor 🔒",
    "Loading Honor access..."
  );

  try {
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

    const urlDiscipline =
      normalizeDiscipline(
        params.get("discipline") || ""
      );

    const storedDiscipline =
      normalizeDiscipline(
        localStorage.getItem(
          `sandman_active_discipline_${athleteId}`
        ) || ""
      );

    const athleteDisciplines =
      disciplineIdsOf(athlete);

    const preferredDiscipline =
      normalizeDiscipline(
        athlete.activeDiscipline ||
        athlete.primaryDiscipline ||
        athlete.discipline ||
        athlete.art ||
        athlete.sport ||
        ""
      );

    let activeDiscipline = "";

    /*
      Routing priority:

      1. A single registered discipline is authoritative.
      2. An explicit URL discipline is allowed when registered.
      3. The athlete's preferred discipline.
      4. Stored browser choice for multi-discipline athletes.
      5. First registered discipline.
    */
    if (athleteDisciplines.length === 1) {
      activeDiscipline =
        athleteDisciplines[0];
    } else if (
      urlDiscipline &&
      athleteDisciplines.includes(urlDiscipline)
    ) {
      activeDiscipline =
        urlDiscipline;
    } else if (
      preferredDiscipline &&
      athleteDisciplines.includes(
        preferredDiscipline
      )
    ) {
      activeDiscipline =
        preferredDiscipline;
    } else if (
      storedDiscipline &&
      athleteDisciplines.includes(
        storedDiscipline
      )
    ) {
      activeDiscipline =
        storedDiscipline;
    } else {
      activeDiscipline =
        athleteDisciplines[0] ||
        "wrestling";
    }

    console.log(
      "Arsenal discipline resolved:",
      {
        athleteId,
        urlDiscipline,
        storedDiscipline,
        preferredDiscipline,
        athleteDisciplines,
        activeDiscipline
      }
    );

    const combat =
      combatForDiscipline(
        athlete,
        activeDiscipline
      );

    const disciplineState =
      String(
        combat.state ||
        combat.status ||
        ""
      ).toLowerCase();

    if (
      athlete.active === false ||
      athlete.rosterStatus === "suspended" ||
      disciplineState === "suspended"
    ) {
      document.body.innerHTML = `
        <main
          style="
            min-height:100vh;
            display:grid;
            place-items:center;
            padding:30px;
            background:#050505;
            color:white;
            font-family:system-ui;
          "
        >
          <section
            style="
              max-width:520px;
              text-align:center;
              border:1px solid rgba(255,255,255,.18);
              border-radius:18px;
              padding:28px;
              background:#111;
            "
          >
            <h1 style="margin:0 0 10px;">
              Account Suspended
            </h1>

            <p
              style="
                margin:0;
                color:#bbb;
                line-height:1.5;
              "
            >
              This athlete account is currently unavailable.
              Please contact your coach regarding account status.
            </p>
          </section>
        </main>
      `;

      return;
    }

    localStorage.setItem(
      "currentAthleteId",
      athleteId
    );

    localStorage.setItem(
      `sandman_active_discipline_${athleteId}`,
      activeDiscipline
    );

    wireNavigation(
      athleteId,
      activeDiscipline
    );

    const stripe =
      getStripeCount(combat);

    const isF8 =
      isF8Athlete(
        athleteId,
        athlete,
        combat
      );

    const isLegacy =
      isLegacyAthlete(athlete);

    /*
      Current unlock doctrine:

      Youth / F8
      Strength: Stripe 2
      Honor: Stripe 3

      New teen/adult / F4
      Strength: Stripe 1
      Honor: Stripe 2

      Legacy teen/adult / F4
      Strength: Stripe 2
      Honor: Stripe 3
    */

    const strengthRequired =
      isF8
        ? 2
        : isLegacy
          ? 2
          : 1;

    const honorRequired =
      isF8
        ? 3
        : isLegacy
          ? 3
          : 2;

    const strengthUnlocked =
      athlete.unlocks?.strength === true ||
      stripe >= strengthRequired;

    const honorUnlocked =
      athlete.unlocks?.honor === true ||
      stripe >= honorRequired;

    const disciplineName =
      disciplineLabel(
        activeDiscipline
      );

    const encodedId =
      encodeURIComponent(athleteId);

    const encodedDiscipline =
      encodeURIComponent(
        activeDiscipline
      );

    setOpen(
      combatCard,
      disciplineName,
      `${disciplineName} Combat Arsenal`,
      `/athletes/arsenal/combat/` +
      `?id=${encodedId}` +
      `&discipline=${encodedDiscipline}`
    );

    if (strengthUnlocked) {
      setOpen(
        strengthCard,
        "Strength",
        "Shared Strength and Conditioning Track",
        `/athletes/arsenal/strength/` +
        `?id=${encodedId}`
      );
    } else {
      setLocked(
        strengthCard,
        "Strength 🔒",
        `Earn Stripe ${strengthRequired} to unlock Strength.`
      );
    }

    if (honorUnlocked) {
      setOpen(
        honorCard,
        "Honor",
        "Shared Honor Development Track",
        `/athletes/arsenal/honor/` +
        `?id=${encodedId}`
      );
    } else {
      setLocked(
        honorCard,
        "Honor 🔒",
        `Earn Stripe ${honorRequired} to unlock Honor.`
      );
    }

    const panel =
      document.getElementById(
        "arsenalModePanel"
      );

    const inner =
      document.getElementById(
        "modePanelInner"
      );

    if (panel) panel.hidden = true;
    if (inner) inner.innerHTML = "";

  } catch (err) {
    console.error(
      "Failed to load Arsenal:",
      err
    );

    setLocked(
      combatCard,
      "Combat unavailable",
      "Unable to verify athlete access."
    );

    const panel =
      document.getElementById(
        "arsenalModePanel"
      );

    const inner =
      document.getElementById(
        "modePanelInner"
      );

    if (panel) panel.hidden = true;
    if (inner) inner.innerHTML = "";
  }
}

await loadUnlocks();