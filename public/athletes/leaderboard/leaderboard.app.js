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

const privateZonePanel = document.getElementById("private-zone-panel");
const nextTargetPanel = document.getElementById("next-target-panel");

const TRACK = (window.LEADERBOARD_TRACK || "foundry4").toLowerCase();

let athletes = [];
let currentAthlete = null;

const params = new URLSearchParams(window.location.search);

const athleteId = (
  params.get("athleteId") ||
  params.get("id") ||
  localStorage.getItem("currentAthleteId") ||
  sessionStorage.getItem("currentAthleteId") ||
  ""
).trim().toUpperCase();

/* =========================
   HELPERS
========================= */

function titleCase(str = "") {
  return str
    ? str.charAt(0).toUpperCase() + str.slice(1)
    : "";
}

function normalizeTrack(raw = "", docId = "") {
  const t = String(raw || "").toLowerCase();
  const id = String(docId || "").toUpperCase();

  if (t.includes("f8") || t.includes("foundry8") || id.startsWith("F8_")) {
    return "foundry8";
  }

  if (t.includes("f4") || t.includes("foundry4") || id.startsWith("F4_")) {
    return "foundry4";
  }

  return "foundry4";
}

function normalizeProgramTrack(raw = "", track = "") {
  const p = String(raw || "").toLowerCase().trim();

  if (p) return p;

  if (track === "foundry8") return "zero2hero";

  return "path2legend";
}

function normalizeTier(raw = "", rank = "") {
  const tier = String(raw || "").toLowerCase().trim();
  const r = String(rank || "").toLowerCase().trim();

  if (tier.startsWith("t")) return tier;

  if (r === "shadow") return "t0";
  if (r === "apprentice") return "t0";
  if (r === "warrior") return "t1";
  if (r === "champion") return "t2";
  if (r === "veteran") return "t3";
  if (r === "legend") return "t4";

  return tier || "t0";
}

function normalizeRank(raw = "", track = "") {
  const r = String(raw || "").toLowerCase().trim();
  if (r) return r;
  return track === "foundry8" ? "shadow" : "apprentice";
}

function normalizeXp(raw = 0) {
  return Number(raw || 0);
}

function labelPath(programTrack = "") {
  const p = String(programTrack || "").toLowerCase();

  if (p === "zero2hero") return "Zero2Hero™";
  if (p === "path2legend") return "Path2Legend™";
  if (p === "road2greatness") return "Road2Greatness™";
  if (p === "quest2mastery") return "Quest2Mastery™";

  return "Sandman Path";
}

/* =========================
   TIER ORDER
========================= */

function getTierOrder() {
  if (TRACK === "foundry8") {
    return ["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"];
  }

  return ["t0", "t1", "t2", "t3", "t4"];
}

function getTierIndex(tier) {
  const order = getTierOrder();
  const idx = order.indexOf(normalizeTier(tier));
  return idx === -1 ? 0 : idx;
}

/* =========================
   SORTING
========================= */

function sortAthletes(list, mode) {
  return [...list].sort((a, b) => {
    if (mode === "lifetime") {
      return (b.lifetimeXp || 0) - (a.lifetimeXp || 0);
    }

    if (mode === "tier") {
      return b.xp - a.xp;
    }

    const tierDiff =
      getTierIndex(b.tier) - getTierIndex(a.tier);

    if (tierDiff !== 0) return tierDiff;

    const xpDiff = b.xp - a.xp;
    if (xpDiff !== 0) return xpDiff;

    return b.stripe - a.stripe;
  });
}

/* =========================
   DATA SCOPING
========================= */

function getTrackAthletes() {
  return athletes.filter(a => a.track === TRACK);
}

function getScopedAthletes() {
  const view = viewModeEl?.value || "overall";
  const rankMode = rankModeEl?.value || "progression";

  let list = getTrackAthletes();

  if (currentAthlete?.programTrack) {
    list = list.filter(a =>
      a.programTrack === currentAthlete.programTrack
    );
  }

  if (view === "tier" && currentAthlete) {
    list = list.filter(a =>
      a.tier === currentAthlete.tier
    );

    list = sortAthletes(list, "tier");
  } else {
    list = sortAthletes(list, rankMode);
  }

  return list.map((a, i) => ({
    ...a,
    scopedRank: i + 1
  }));
}

/* =========================
   UI
========================= */

function rowHtml(a, isYou = false) {
  return `
    <div class="rank-row ${isYou ? "you" : ""}">
      <div class="rank-num">#${a.scopedRank}</div>

      <div class="rank-name">
        ${a.name}
        ${isYou ? `<span class="you-badge">YOU</span>` : ``}
      </div>

      <div class="rank-tier">
        ${a.tier.toUpperCase()} ${titleCase(a.rank)}
      </div>

      <div class="rank-stripe">
        ${a.stripe}
      </div>

      <div class="rank-xp">
        ${a.xp} XP
      </div>
    </div>
  `;
}

function updateBoardTitle() {
  if (!boardTitleEl) return;

  if (!currentAthlete) {
    boardTitleEl.textContent = "Top 8";
    return;
  }

  const view = viewModeEl?.value || "overall";

  if (view === "tier") {
    boardTitleEl.textContent =
      `${labelPath(currentAthlete.programTrack)} · ${currentAthlete.tier.toUpperCase()} ${titleCase(currentAthlete.rank)} Top 8`;
  } else {
    boardTitleEl.textContent =
      `${labelPath(currentAthlete.programTrack)} · Overall Top 8`;
  }
}

function renderTop8() {
  const list = getScopedAthletes().slice(0, 8);

  top8ListEl.innerHTML = list.length
    ? list.map(a => rowHtml(a, a.id === athleteId)).join("")
    : `<div class="empty">No rankings yet.</div>`;
}

function renderYourZone() {
  if (!currentAthlete) return;

  const scoped = getScopedAthletes();
  const index = scoped.findIndex(a => a.id === currentAthlete.id);

  if (index === -1) {
    yourZoneEl.innerHTML = `<div class="empty">You are not ranked in this board yet.</div>`;
    return;
  }

  const zone = scoped.slice(
    Math.max(0, index - 2),
    index + 3
  );

  yourZoneEl.innerHTML = zone
    .map(a => rowHtml(a, a.id === currentAthlete.id))
    .join("");
}

function renderNextTarget() {
  if (!currentAthlete) return;

  const scoped = getScopedAthletes();
  const me = scoped.find(a => a.id === currentAthlete.id);

  if (!me) {
    nextTargetEl.innerHTML =
      `<div class="empty">No target yet.</div>`;
    return;
  }

  const next = scoped
    .filter(a => a.scopedRank < me.scopedRank)
    .sort((a, b) => b.scopedRank - a.scopedRank)[0];

  if (!next) {
    nextTargetEl.innerHTML =
      `<div class="empty">You're #1</div>`;
    return;
  }

  const gap = Math.max(0, next.xp - me.xp + 1);

  nextTargetEl.innerHTML = `
    <div>${next.name}</div>
    <div>#${next.scopedRank}</div>
    <div>+${gap} XP</div>
  `;
}

function render() {
  if (!currentAthlete) {
    updateBoardTitle();

    if (top8ListEl) {
      top8ListEl.innerHTML = `<div class="empty">No rankings yet.</div>`;
    }

    if (yourZoneEl) {
      yourZoneEl.innerHTML = `<div class="empty">Athlete unavailable.</div>`;
    }

    if (nextTargetEl) {
      nextTargetEl.innerHTML = `<div class="empty">No target yet.</div>`;
    }

    return;
  }

  updateBoardTitle();
  renderTop8();

  const mode = modeToggleEl?.value || "private";

  if (privateZonePanel) {
    privateZonePanel.hidden = mode === "public";
  }

  if (nextTargetPanel) {
    nextTargetPanel.hidden = mode === "public";
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
  const snap = await getDocs(collection(db, "athletes"));

  athletes = snap.docs
    .map(doc => {
      const data = doc.data() || {};
      const id = doc.id.toUpperCase();

      const track = normalizeTrack(data.track, doc.id);
      const programTrack =
        normalizeProgramTrack(data.programTrack, track);

      const rank = normalizeRank(data.rank, track);
      const tier = normalizeTier(data.tier, rank);

      const name =
        data.publicName ||
        data.fullName ||
        data.name ||
        `${data.first || ""} ${data.last || ""}`.trim() ||
        doc.id;

      return {
        id,
        name,
        track,
        programTrack,
        tier,
        rank,
        stripe: Number(data.stripeCount || 0),
        xp: normalizeXp(data.xp),

        lifetimeXp: normalizeXp(
          data.lifetimeXp ??
          data.xpLifetime ??
          data.totalLifetimeXp ??
          data.xp
        ),

        isDev: data.isDev === true,
        isTest: data.isTest === true,
        devMode: data.devMode === true,

        active: data.active !== false,
        rosterStatus: String(data.rosterStatus || "").toLowerCase(),
        disciplineState: String(data?.discipline?.state || "").toLowerCase()
      };
    })
    .filter(a => {
      const id = a.id;
      const name = a.name.toLowerCase();

      return (
        a.active &&
        a.rosterStatus !== "suspended" &&
        a.disciplineState !== "suspended" &&
        !a.isDev &&
        !a.isTest &&
        !a.devMode &&
        !id.includes("_TEST_") &&
        !id.includes("_GHOST_") &&
        !id.includes("GHOST") &&
        !name.includes("dev") &&
        !name.includes("ghost")
      );
    });

  currentAthlete =
    athletes.find(a => a.id === athleteId) ||
    athletes[0] ||
    null;

  if (currentAthlete) {
    localStorage.setItem("currentAthleteId", currentAthlete.id);
    localStorage.setItem("currentAthleteTier", currentAthlete.tier);
    localStorage.setItem("currentProgramTrack", currentAthlete.programTrack);

    if (viewModeEl && athleteId) {
      viewModeEl.value = "tier";
    }
  }

  render();
}

/* =========================
   EVENTS
========================= */

viewModeEl?.addEventListener("change", render);
modeToggleEl?.addEventListener("change", render);
rankModeEl?.addEventListener("change", render);

loadAthletes();