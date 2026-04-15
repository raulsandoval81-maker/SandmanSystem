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

function titleCase(str = "") {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function normalizeTrack(raw = "", docId = "") {
  const t = String(raw || "").toLowerCase();
  const id = String(docId || "").toUpperCase();

  if (t.includes("f8") || t.includes("foundry8") || id.startsWith("F8_")) return "foundry8";
  if (t.includes("f4") || t.includes("foundry4") || id.startsWith("F4_")) return "foundry4";

  return "foundry4";
}

function normalizeTier(raw = "") {
  return String(raw || "").toLowerCase().trim();
}

function normalizeXp(raw = 0) {
  return Number(raw || 0);
}

function sortByXp(list) {
  return [...list].sort((a, b) => b.xp - a.xp);
}

function getTierOrder() {
  if (TRACK === "foundry8") {
    return ["shadow", "recruit", "combatant", "competitor", "warrior", "champion", "veteran", "hero"];
  }

  return ["apprentice", "warrior", "champion", "veteran", "legend"];
}

function getTrackAthletes() {
  return athletes.filter(a => a.track === TRACK);
}

function getScopedAthletes() {
  const view = viewModeEl ? viewModeEl.value : "overall";
  const trackAthletes = getTrackAthletes();

  if (view === "tier" && currentAthlete) {
    return sortByXp(trackAthletes.filter(a => a.tier === currentAthlete.tier))
      .map((a, i) => ({ ...a, scopedRank: i + 1 }));
  }

  return sortByXp(trackAthletes)
    .map((a, i) => ({ ...a, scopedRank: i + 1 }));
}

function getScopedCurrentAthlete() {
  if (!currentAthlete) return null;

  const scopedAthletes = getScopedAthletes();
  const found = scopedAthletes.find(a => a.id === currentAthlete.id);

  return found || null;
}

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
  if (!top8ListEl) return;

  const list = getScopedAthletes().slice(0, 8);

  top8ListEl.innerHTML = list.length
    ? list.map(a => rowHtml(a, a.id === athleteId)).join("")
    : `<div class="empty">No rankings yet.</div>`;

  if (boardTitleEl) {
    const view = viewModeEl ? viewModeEl.value : "overall";

    if (view === "tier" && currentAthlete?.tier) {
      boardTitleEl.textContent = `${titleCase(currentAthlete.tier)} Top 8`;
    } else {
      boardTitleEl.textContent = "Top 8";
    }
  }
}

function renderYourZone() {
  if (!yourZoneEl) return;

  if (!currentAthlete) {
    yourZoneEl.innerHTML = `<div class="empty">No athlete selected.</div>`;
    return;
  }

  const scopedAthletes = getScopedAthletes();
  const index = scopedAthletes.findIndex(a => a.id === currentAthlete.id);

  if (index === -1) {
    yourZoneEl.innerHTML = `<div class="empty">No zone data yet.</div>`;
    return;
  }

  const zone = scopedAthletes.slice(
    Math.max(0, index - 2),
    index + 3
  );

  yourZoneEl.innerHTML = zone.length
    ? zone.map(a => rowHtml(a, a.id === currentAthlete.id)).join("")
    : `<div class="empty">No zone data yet.</div>`;
}

function renderNextTarget() {
  if (!nextTargetEl) return;

  if (!currentAthlete) {
    nextTargetEl.innerHTML = `<div class="empty">No athlete selected.</div>`;
    return;
  }

  const scopedAthletes = getScopedAthletes();
  const me = scopedAthletes.find(a => a.id === currentAthlete.id);

  if (!me) {
    nextTargetEl.innerHTML = `<div class="empty">No target data yet.</div>`;
    return;
  }

  const next = scopedAthletes
    .filter(a => a.scopedRank < me.scopedRank)
    .sort((a, b) => b.scopedRank - a.scopedRank)[0];

  if (!next) {
    nextTargetEl.innerHTML = `<div class="empty">You're #1</div>`;
    return;
  }

  const gap = Math.max(0, next.xp - me.xp + 1);

  nextTargetEl.innerHTML = `
    <div class="target-name">${next.name}</div>
    <div class="target-rank">Rank #${next.scopedRank}</div>
    <div class="target-gap">+${gap} XP to pass</div>
  `;
}

function syncPrivatePanels() {
  const mode = modeToggleEl ? modeToggleEl.value : "private";

  if (mode === "public") {
    if (privateZonePanel) privateZonePanel.style.display = "none";
    if (nextTargetPanel) nextTargetPanel.style.display = "none";
  } else {
    if (privateZonePanel) privateZonePanel.style.display = "";
    if (nextTargetPanel) nextTargetPanel.style.display = "";
  }
}

function render() {
  if (!currentAthlete) {
    if (top8ListEl) top8ListEl.innerHTML = `<div class="empty">No athlete selected.</div>`;
    if (yourZoneEl) yourZoneEl.innerHTML = `<div class="empty">No athlete selected.</div>`;
    if (nextTargetEl) nextTargetEl.innerHTML = `<div class="empty">No athlete selected.</div>`;
    syncPrivatePanels();
    return;
  }

  renderTop8();
  syncPrivatePanels();

  const mode = modeToggleEl ? modeToggleEl.value : "private";
  if (mode !== "public") {
    renderYourZone();
    renderNextTarget();
  }
}

async function loadAthletes() {
  const snap = await getDocs(collection(db, "athletes"));

  athletes = snap.docs
    .map(doc => {
      const data = doc.data() || {};

      return {
        id: doc.id.toUpperCase(),
        name: data.fullName || data.name || doc.id,
        track: normalizeTrack(data.track, doc.id),
        tier: normalizeTier(data.tier || data.rank || data.rankName || ""),
        stripe: Number(data.stripeCount || data.stripe || 0),
        xp: normalizeXp(data.xp),

        isDev: data.isDev === true,
        isTest: data.isTest === true,
        devMode: data.devMode === true
      };
    })
    .filter(a =>
      a.track === TRACK &&
      !a.isDev &&
      !a.isTest &&
      !a.devMode &&
      !a.name.toLowerCase().includes("dev")
    );

  currentAthlete =
    athletes.find(a => a.id === athleteId) ||
    athletes[0] ||
    null;

  render();
}

if (viewModeEl) viewModeEl.addEventListener("change", render);
if (modeToggleEl) modeToggleEl.addEventListener("change", render);

loadAthletes().catch(err => {
  console.error("[leaderboard] load failed:", err);
  if (top8ListEl) top8ListEl.innerHTML = `<div class="empty">Failed to load leaderboard.</div>`;
  if (yourZoneEl) yourZoneEl.innerHTML = `<div class="empty">Failed to load private zone.</div>`;
  if (nextTargetEl) nextTargetEl.innerHTML = `<div class="empty">Failed to load next target.</div>`;
});