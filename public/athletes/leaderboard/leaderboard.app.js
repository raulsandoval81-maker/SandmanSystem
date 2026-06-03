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
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function normalizeTrack(raw = "", docId = "") {
  const t = String(raw || "").toLowerCase();
  const id = String(docId || "").toUpperCase();

  if (t.includes("f8") || id.startsWith("F8_")) return "foundry8";
  if (t.includes("f4") || id.startsWith("F4_")) return "foundry4";

  return "foundry4";
}

function normalizeTier(raw = "") {
  return String(raw || "").toLowerCase().trim();
}

function normalizeXp(raw = 0) {
  return Number(raw || 0);
}

/* =========================
   TIER ORDER
========================= */

function getTierOrder() {
  if (TRACK === "foundry8") {
    return ["shadow","recruit","combatant","competitor","warrior","champion","veteran","hero"];
  }
  return ["apprentice","warrior","champion","veteran","legend"];
}

function getTierIndex(tier) {
  const order = getTierOrder();
  const idx = order.indexOf(normalizeTier(tier));
  return idx === -1 ? 0 : idx;
}

/* =========================
   🔥 ONE SORTING BRAIN
========================= */

function sortAthletes(list, mode) {
  return [...list].sort((a, b) => {

    if (mode === "lifetime") {
      return (b.lifetimeXp || 0) - (a.lifetimeXp || 0);
    }

    if (mode === "tier") {
      return b.xp - a.xp;
    }

    // progression / overall / track
    const tierDiff = getTierIndex(b.tier) - getTierIndex(a.tier);
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
  const rankingMode = modeToggleEl?.value || "progression";

  let list = getTrackAthletes();

  if (view === "tier" && currentAthlete) {
    list = list.filter(a => a.tier === currentAthlete.tier);
    list = sortAthletes(list, "tier");
  } else {
    list = sortAthletes(list, rankingMode);
  }

  return list.map((a, i) => ({ ...a, scopedRank: i + 1 }));
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
      <div class="rank-tier">${titleCase(a.tier)}</div>
      <div class="rank-stripe">${a.stripe}</div>
      <div class="rank-xp">${a.xp} XP</div>
    </div>
  `;
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

  const zone = scoped.slice(Math.max(0, index - 2), index + 3);

  yourZoneEl.innerHTML = zone.map(a =>
    rowHtml(a, a.id === currentAthlete.id)
  ).join("");
}

function renderNextTarget() {
  if (!currentAthlete) return;

  const scoped = getScopedAthletes();
  const me = scoped.find(a => a.id === currentAthlete.id);

  const next = scoped
    .filter(a => a.scopedRank < me.scopedRank)
    .sort((a, b) => b.scopedRank - a.scopedRank)[0];

  if (!next) {
    nextTargetEl.innerHTML = `<div class="empty">You're #1</div>`;
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
  if (!currentAthlete) return;

  renderTop8();

  const mode = modeToggleEl?.value || "private";
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
      const name = (data.fullName || data.name || doc.id);

      return {
        id,
        name,
        track: normalizeTrack(data.track, doc.id),
        tier: normalizeTier(data.tier || data.rankName),
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
        devMode: data.devMode === true
      };
    })
    .filter(a => {
      const id = a.id;
      const name = a.name.toLowerCase();

      return (
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

  render();
}
/* =========================
   EVENTS
========================= */

viewModeEl?.addEventListener("change", render);
modeToggleEl?.addEventListener("change", render);

loadAthletes();