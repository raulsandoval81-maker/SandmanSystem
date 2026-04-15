import {
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const leaderboardList = document.getElementById("leaderboard-list");
const trackFilterEl = document.getElementById("track-filter");
const viewModeEl = document.getElementById("view-mode");

let athletes = [];

function titleCase(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sortByXp(list) {
  return [...list].sort((a, b) => b.xp - a.xp);
}

/* --------------------------------------
   Track-specific tier ladders
---------------------------------------*/
function getTierOrder(track) {
  if (track === "foundry8") {
    return ["shadow","recruit","combatant","competitor","warrior","champion","commander","hero"];
  }

  return ["apprentice","warrior","champion","veteran","legend"];
}

/* --------------------------------------
   Public board = sealed track view
   NO crossover
---------------------------------------*/
function getTrackAthletes() {
  const track = trackFilterEl.value;
  return athletes.filter(a => a.track === track);
}

function rowHtml(entry, rank) {
  let rankClass = "";
  if (rank === 1) rankClass = "top-1";
  if (rank === 2) rankClass = "top-2";
  if (rank === 3) rankClass = "top-3";

  return `
    <div class="rank-row ${rankClass}">
      <div class="rank-num">#${rank}</div>
      <div class="rank-name">${entry.name}</div>
      <div class="rank-tier">${titleCase(entry.tier)}</div>
      <div class="rank-xp">${entry.xp} XP</div>
    </div>
  `;
}

/* --------------------------------------
   Overall = Top 8 for selected track only
---------------------------------------*/
function renderOverall(list) {
  const top8 = sortByXp(list).slice(0, 8);

  leaderboardList.innerHTML = top8.length
    ? top8.map((a, i) => rowHtml(a, i + 1)).join("")
    : `<div class="empty">No rankings yet.</div>`;
}

/* --------------------------------------
   Tier view = grouped by selected track's tiers
   still no crossover
---------------------------------------*/
function renderByTier(list) {
  const track = trackFilterEl.value;
  const tierOrder = getTierOrder(track);

  const html = tierOrder.map(tier => {
    const group = sortByXp(
      list.filter(a => a.tier === tier)
    ).slice(0, 8);

    if (!group.length) return "";

    return `
      <div class="group-block">
        <div class="group-title">${titleCase(tier)}</div>
        ${group.map((a, i) => rowHtml(a, i + 1)).join("")}
      </div>
    `;
  }).join("");

  leaderboardList.innerHTML = html || `<div class="empty">No rankings.</div>`;
}

function render() {
  const filtered = getTrackAthletes();
  const view = viewModeEl.value;

  if (view === "tier") {
    renderByTier(filtered);
  } else {
    renderOverall(filtered);
  }
}

/* --------------------------------------
   Live Firestore load
---------------------------------------*/
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

async function loadAthletes() {
  const snap = await getDocs(collection(db, "athletes"));

  athletes = snap.docs
    .map(doc => {
      const d = doc.data() || {};

      return {
        name: d.fullName || d.name || doc.id,
        track: normalizeTrack(d.track, doc.id),
        tier: normalizeTier(d.tier || d.rank || d.rankName || ""),
        xp: Number(d.xp || 0),
        isDev: d.isDev === true,
        isTest: d.isTest === true,
        devMode: d.devMode === true
      };
    })
    .filter(a =>
      !a.isDev &&
      !a.isTest &&
      !a.devMode &&
      !a.name.toLowerCase().includes("dev")
    );

  render();
}

trackFilterEl.addEventListener("change", render);
viewModeEl.addEventListener("change", render);

loadAthletes().catch(err => {
  console.error("[public leaderboard] load failed:", err);
  leaderboardList.innerHTML = `<div class="empty">Failed to load leaderboard.</div>`;
});