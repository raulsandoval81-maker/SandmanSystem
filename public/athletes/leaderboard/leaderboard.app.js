import {
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const top8ListEl = document.getElementById("top8-list");
const yourZoneEl = document.getElementById("your-zone");
const nextTargetEl = document.getElementById("next-target");

const viewModeEl = document.getElementById("view-mode");
const modeToggleEl = document.getElementById("mode-toggle");
const rankModeEl = document.getElementById("rank-mode");
const boardTitleEl = document.getElementById("board-title");

const privateZonePanel =
  document.getElementById("private-zone-panel");

const nextTargetPanel =
  document.getElementById("next-target-panel");

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

let athleteDocs = [];
let combatEntries = [];

let currentAthlete = null;
let currentCombatEntry = null;
let activeDiscipline = "";

/* =========================
   HELPERS
========================= */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleCase(value = "") {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) =>
      part.charAt(0).toUpperCase() +
      part.slice(1)
    )
    .join(" ");
}

function normalizeDiscipline(value = "") {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

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

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}

function disciplineLabel(value = "") {
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

  return labels[normalized] ||
    titleCase(normalized) ||
    "Combat";
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
        data.sport,
        data.trackDiscipline
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

  return allowed[0] || "";
}

function combatForDiscipline(
  data = {},
  discipline = ""
) {
  const normalized =
    normalizeDiscipline(discipline);

  return (
    data.disciplines?.[normalized] ||
    data
  );
}

function normalizeTrack(
  raw = "",
  docId = ""
) {
  const value =
    String(raw || "")
      .toLowerCase();

  const id =
    String(docId || "")
      .toUpperCase();

  if (
    value.includes("f8") ||
    value.includes("foundry8") ||
    value.includes("zero2hero") ||
    value.includes("z2h") ||
    id.startsWith("F8_")
  ) {
    return "foundry8";
  }

  return "foundry4";
}

function normalizeProgramTrack(
  raw = "",
  track = ""
) {
  const value =
    String(raw || "")
      .trim()
      .toLowerCase();

  if (
    value.includes("zero2hero") ||
    value.includes("z2h")
  ) {
    return "zero2hero";
  }

  if (
    value.includes("quest2mastery") ||
    value.includes("q2m") ||
    value.includes("mastery")
  ) {
    return "quest2mastery";
  }

  if (
    value.includes("path2legend") ||
    value.includes("p2l") ||
    value.includes("foundry4")
  ) {
    return "path2legend";
  }

  return track === "foundry8"
    ? "zero2hero"
    : "path2legend";
}

function normalizeTier(
  raw = "",
  rank = ""
) {
  const tier =
    String(raw || "")
      .trim()
      .toLowerCase();

  const rankName =
    String(rank || "")
      .trim()
      .toLowerCase();

  if (/^t\d+$/.test(tier)) {
    return tier;
  }

  const tierNumber =
    tier.match(/\d+/)?.[0];

  if (tierNumber !== undefined) {
    return `t${tierNumber}`;
  }

  const rankTierMap = {
    shadow: "t0",
    apprentice: "t0",
    recruit: "t1",
    contender: "t2",
    competitor: "t3",
    warrior: "t1",
    champion: "t2",
    veteran: "t3",
    commander: "t6",
    legend: "t4",
    hero: "t7",
    master: "t4"
  };

  return rankTierMap[rankName] || "t0";
}

function normalizeRank(
  raw = "",
  track = ""
) {
  const rank =
    String(raw || "")
      .trim()
      .toLowerCase();

  if (rank) return rank;

  return track === "foundry8"
    ? "shadow"
    : "apprentice";
}

function normalizeXp(value = 0) {
  const xp = Number(value || 0);
  return Number.isFinite(xp) ? xp : 0;
}

function athleteName(
  data = {},
  fallback = ""
) {
  return (
    data.publicName ||
    data.fullName ||
    data.name ||
    [data.firstName, data.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    fallback
  );
}

function labelPath(
  programTrack = ""
) {
  if (programTrack === "zero2hero") {
    return "Zero2Hero™";
  }

  if (programTrack === "path2legend") {
    return "Path2Legend™";
  }

  if (programTrack === "quest2mastery") {
    return "Quest2Mastery™";
  }

  return "Sandman Path";
}

function isEligibleAthlete(
  data = {},
  id = ""
) {
  const name =
    athleteName(data, id)
      .toLowerCase();

  const rosterStatus =
    String(
      data.rosterStatus || ""
    ).toLowerCase();

  const disciplineState =
    String(
      data?.discipline?.state || ""
    ).toLowerCase();

  return (
    data.active !== false &&
    rosterStatus !== "suspended" &&
    disciplineState !== "suspended" &&
    data.isDev !== true &&
    data.isTest !== true &&
    data.devMode !== true &&
    !id.includes("_TEST_") &&
    !id.includes("_GHOST_") &&
    !id.includes("GHOST") &&
    !name.includes("dev") &&
    !name.includes("ghost")
  );
}

/* =========================
   TIER ORDER
========================= */

function getTierOrder(track) {
  if (track === "foundry8") {
    return [
      "t0",
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
      "t6",
      "t7"
    ];
  }

  return [
    "t0",
    "t1",
    "t2",
    "t3",
    "t4"
  ];
}

function getTierIndex(
  tier,
  track
) {
  const order =
    getTierOrder(track);

  const index =
    order.indexOf(
      normalizeTier(tier)
    );

  return index === -1
    ? 0
    : index;
}

/* =========================
   SORTING
========================= */

function scoreFor(
  athlete,
  rankMode
) {
  return rankMode === "lifetime"
    ? athlete.lifetimeXp
    : athlete.xp;
}

function sortAthletes(
  list,
  rankMode
) {
  return [...list].sort((a, b) => {
    if (rankMode === "lifetime") {
      return (
        b.lifetimeXp -
        a.lifetimeXp
      );
    }

    const tierDifference =
      getTierIndex(b.tier, b.track) -
      getTierIndex(a.tier, a.track);

    if (tierDifference !== 0) {
      return tierDifference;
    }

    const xpDifference =
      b.xp - a.xp;

    if (xpDifference !== 0) {
      return xpDifference;
    }

    return (
      b.stripe -
      a.stripe
    );
  });
}

/* =========================
   BOARD DATA
========================= */

function lifetimeEntries() {
  return athleteDocs.map((athlete) => {
    const athleteDiscipline =
      resolveActiveDiscipline(
        athlete.data,
        athlete.data.activeDiscipline
      );

    const combat =
      combatForDiscipline(
        athlete.data,
        athleteDiscipline
      );

    const track =
      normalizeTrack(
        combat.track ||
        combat.trackCode ||
        athlete.data.track ||
        athlete.data.trackCode,
        athlete.id
      );

    const rank =
      normalizeRank(
        combat.rankName ||
        combat.rank ||
        combat.tierName,
        track
      );

    return {
      id: athlete.id,
      name: athleteName(
        athlete.data,
        athlete.id
      ),
      discipline: athleteDiscipline,
      track,
      programTrack:
        normalizeProgramTrack(
          combat.programTrack ||
          combat.journey ||
          athlete.data.programTrack ||
          athlete.data.journey,
          track
        ),
      tier: normalizeTier(
        combat.tier,
        rank
      ),
      rank,
      stripe: Number(
        combat.stripeCount ??
        combat.stripes ??
        0
      ),
      xp: normalizeXp(combat.xp),
      lifetimeXp: normalizeXp(
        athlete.data.lifetimeXp ??
        athlete.data.xpLifetime ??
        athlete.data.totalLifetimeXp ??
        0
      )
    };
  });
}

function getScopedAthletes() {
  const rankMode =
    rankModeEl?.value ||
    "progression";

  const view =
    viewModeEl?.value ||
    "overall";

  let list;

  if (rankMode === "lifetime") {
    list = lifetimeEntries();
  } else {
    list = combatEntries.filter(
      (athlete) =>
        athlete.discipline ===
          activeDiscipline &&
        athlete.track ===
          currentCombatEntry?.track &&
        athlete.programTrack ===
          currentCombatEntry?.programTrack
    );

    if (
      view === "tier" &&
      currentCombatEntry
    ) {
      list = list.filter(
        (athlete) =>
          athlete.tier ===
          currentCombatEntry.tier
      );
    }
  }

  return sortAthletes(
    list,
    rankMode
  ).map((athlete, index) => ({
    ...athlete,
    scopedRank: index + 1
  }));
}

/* =========================
   UI
========================= */

function rowHtml(
  athlete,
  isYou = false
) {
  const rankMode =
    rankModeEl?.value ||
    "progression";

  const tierLabel =
    rankMode === "lifetime"
      ? "Lifetime"
      : `${athlete.tier.toUpperCase()} ${titleCase(athlete.rank)}`;

  const stripeLabel =
    rankMode === "lifetime"
      ? "—"
      : athlete.stripe;

  const xp =
    scoreFor(
      athlete,
      rankMode
    );

  return `
    <div class="rank-row ${isYou ? "you" : ""}">
      <div class="rank-num">
        #${athlete.scopedRank}
      </div>

      <div class="rank-name">
        ${esc(athlete.name)}
        ${
          isYou
            ? `<span class="you-badge">YOU</span>`
            : ""
        }
      </div>

      <div class="rank-tier">
        ${esc(tierLabel)}
      </div>

      <div class="rank-stripe">
        ${esc(stripeLabel)}
      </div>

      <div class="rank-xp">
        ${xp} XP
      </div>
    </div>
  `;
}

function updateBoardTitle() {
  if (!boardTitleEl) return;

  if (!currentAthlete) {
    boardTitleEl.textContent =
      "Leaderboard";
    return;
  }

  const rankMode =
    rankModeEl?.value ||
    "progression";

  const view =
    viewModeEl?.value ||
    "overall";

  if (rankMode === "lifetime") {
    boardTitleEl.textContent =
      "Sandman Lifetime XP · Top 8";

    return;
  }

  const discipline =
    disciplineLabel(
      activeDiscipline
    );

  if (view === "tier") {
    boardTitleEl.textContent =
      `${labelPath(currentCombatEntry.programTrack)} · ` +
      `${discipline} · ` +
      `${currentCombatEntry.tier.toUpperCase()} ` +
      `${titleCase(currentCombatEntry.rank)} Top 8`;
  } else {
    boardTitleEl.textContent =
      `${labelPath(currentCombatEntry.programTrack)} · ` +
      `${discipline} · Overall Top 8`;
  }
}

function renderTop8() {
  const list =
    getScopedAthletes()
      .slice(0, 8);

  top8ListEl.innerHTML =
    list.length
      ? list
          .map((athlete) =>
            rowHtml(
              athlete,
              athlete.id === athleteId
            )
          )
          .join("")
      : `<div class="empty">No rankings yet.</div>`;
}

function renderYourZone() {
  if (!currentAthlete) return;

  const scoped =
    getScopedAthletes();

  const index =
    scoped.findIndex(
      (athlete) =>
        athlete.id === athleteId
    );

  if (index === -1) {
    yourZoneEl.innerHTML =
      `<div class="empty">You are not ranked in this board yet.</div>`;

    return;
  }

  const zone =
    scoped.slice(
      Math.max(0, index - 2),
      index + 3
    );

  yourZoneEl.innerHTML =
    zone
      .map((athlete) =>
        rowHtml(
          athlete,
          athlete.id === athleteId
        )
      )
      .join("");
}

function renderNextTarget() {
  if (!currentAthlete) return;

  const rankMode =
    rankModeEl?.value ||
    "progression";

  const scoped =
    getScopedAthletes();

  const me =
    scoped.find(
      (athlete) =>
        athlete.id === athleteId
    );

  if (!me) {
    nextTargetEl.innerHTML =
      `<div class="empty">No target yet.</div>`;

    return;
  }

  const next =
    scoped.find(
      (athlete) =>
        athlete.scopedRank ===
        me.scopedRank - 1
    );

  if (!next) {
    nextTargetEl.innerHTML =
      `<div class="empty">You're #1</div>`;

    return;
  }

  const gap =
    Math.max(
      0,
      scoreFor(next, rankMode) -
      scoreFor(me, rankMode) +
      1
    );

  nextTargetEl.innerHTML = `
    <div>${esc(next.name)}</div>
    <div>#${next.scopedRank}</div>
    <div>+${gap} XP</div>
  `;
}

function render() {
  if (!currentAthlete) {
    updateBoardTitle();

    top8ListEl.innerHTML =
      `<div class="empty">Athlete unavailable.</div>`;

    if (yourZoneEl) {
      yourZoneEl.innerHTML =
        `<div class="empty">Athlete unavailable.</div>`;
    }

    if (nextTargetEl) {
      nextTargetEl.innerHTML =
        `<div class="empty">No target yet.</div>`;
    }

    return;
  }

  updateBoardTitle();
  renderTop8();

  const mode =
    modeToggleEl?.value ||
    "private";

  if (privateZonePanel) {
    privateZonePanel.hidden =
      mode === "public";
  }

  if (nextTargetPanel) {
    nextTargetPanel.hidden =
      mode === "public";
  }

  if (mode !== "public") {
    renderYourZone();
    renderNextTarget();
  }
}

/* =========================
   LOAD
========================= */

async function loadAthletes() {
  const snapshot =
    await getDocs(
      collection(db, "athletes")
    );

  athleteDocs =
    snapshot.docs
      .map((document) => ({
        id: document.id.toUpperCase(),
        data: document.data() || {}
      }))
      .filter((athlete) =>
        isEligibleAthlete(
          athlete.data,
          athlete.id
        )
      );

  currentAthlete =
    athleteDocs.find(
      (athlete) =>
        athlete.id === athleteId
    ) || null;

  if (!currentAthlete) {
    render();
    return;
  }

  const requestedDiscipline =
    params.get("discipline");

  activeDiscipline =
    resolveActiveDiscipline(
      currentAthlete.data,
      requestedDiscipline
    );

  combatEntries =
    athleteDocs.flatMap((athlete) => {
      const disciplines =
        disciplineIdsOf(
          athlete.data
        );

      return disciplines.map(
        (discipline) => {
          const combat =
            combatForDiscipline(
              athlete.data,
              discipline
            );

          const track =
            normalizeTrack(
              combat.track ||
              combat.trackCode ||
              combat.programTrack ||
              combat.journey ||
              athlete.data.track ||
              athlete.data.trackCode ||
              athlete.data.programTrack ||
              athlete.data.journey,
              athlete.id
            );

          const programTrack =
            normalizeProgramTrack(
              combat.programTrack ||
              combat.journey ||
              athlete.data.programTrack ||
              athlete.data.journey,
              track
            );

          const rank =
            normalizeRank(
              combat.rankName ||
              combat.rank ||
              combat.tierName,
              track
            );

          return {
            id: athlete.id,
            name: athleteName(
              athlete.data,
              athlete.id
            ),
            discipline,
            track,
            programTrack,
            tier: normalizeTier(
              combat.tier,
              rank
            ),
            rank,
            stripe: Number(
              combat.stripeCount ??
              combat.stripes ??
              0
            ),
            xp: normalizeXp(
              combat.xp ??
              combat.currentTierXP
            ),
            lifetimeXp: normalizeXp(
              athlete.data.lifetimeXp ??
              athlete.data.xpLifetime ??
              athlete.data.totalLifetimeXp ??
              0
            )
          };
        }
      );
    });

  currentCombatEntry =
    combatEntries.find(
      (entry) =>
        entry.id === athleteId &&
        entry.discipline ===
          activeDiscipline
    ) ||
    combatEntries.find(
      (entry) =>
        entry.id === athleteId
    ) ||
    null;

  if (!currentCombatEntry) {
    render();
    return;
  }

  localStorage.setItem(
    "currentAthleteId",
    currentAthlete.id
  );

  localStorage.setItem(
    "currentAthleteTier",
    currentCombatEntry.tier
  );

  localStorage.setItem(
    "currentProgramTrack",
    currentCombatEntry.programTrack
  );

  localStorage.setItem(
    `sandman_active_discipline_${currentAthlete.id}`,
    activeDiscipline
  );

  if (viewModeEl) {
    viewModeEl.value = "tier";
  }

  render();
}

/* =========================
   EVENTS
========================= */

viewModeEl?.addEventListener(
  "change",
  render
);

modeToggleEl?.addEventListener(
  "change",
  render
);

rankModeEl?.addEventListener(
  "change",
  render
);

loadAthletes().catch((error) => {
  console.error(
    "[leaderboard] load failed:",
    error
  );

  if (top8ListEl) {
    top8ListEl.innerHTML =
      `<div class="empty">Leaderboard unavailable.</div>`;
  }
});
