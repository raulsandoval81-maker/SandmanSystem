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

function getTierOrder(track) {
  if (track === "foundry8") {
    return ["shadow","recruit","combatant","competitor","warrior","champion","commander","hero"];
  }
  return ["apprentice","warrior","champion","veteran","legend"];
}

function getTierIndex(tier, track) {
  const order = getTierOrder(track);
  const idx = order.indexOf(tier);
  return idx === -1 ? 0 : idx;
}

function sortByProgression(list, track) {
  return [...list].sort((a, b) => {
    const tierDiff = getTierIndex(b.tier, track) - getTierIndex(a.tier, track);
    if (tierDiff !== 0) return tierDiff;
    return b.xp - a.xp;
  });
}

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

function renderOverall(list) {
  const track = trackFilterEl.value;
  const top8 = sortByProgression(list, track).slice(0, 8);

  leaderboardList.innerHTML = top8.length
    ? top8.map((a, i) => rowHtml(a, i + 1)).join("")
    : `<div class="empty">No rankings yet.</div>`;
}

function renderByTier(list) {
  const track = trackFilterEl.value;
  const tierOrder = getTierOrder(track);

  const html = tierOrder.map(tier => {
    const group = list
      .filter(a => a.tier === tier)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 8);

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

  if (view === "tier") renderByTier(filtered);
  else renderOverall(filtered);
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

function isRealPublicAthlete(a) {
  const id = String(a.id || "").toUpperCase();
  const name = String(a.name || "").toLowerCase();

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
}

async function loadAthletes() {
  const snap = await getDocs(collection(db, "athletes"));

  athletes = snap.docs
    .map(doc => {
      const d = doc.data() || {};
      const id = doc.id.toUpperCase();

      return {
        id,
        name: d.fullName || d.name || doc.id,
        track: normalizeTrack(d.track, doc.id),
        tier: normalizeTier(d.tier || d.rank || d.rankName || ""),
        xp: Number(d.xp || 0),
        isDev: d.isDev === true,
        isTest: d.isTest === true,
        devMode: d.devMode === true
      };
    })
    .filter(isRealPublicAthlete);

  render();
}

trackFilterEl.addEventListener("change", render);
viewModeEl.addEventListener("change", render);

loadAthletes().catch(err => {
  console.error("[public leaderboard] load failed:", err);
  leaderboardList.innerHTML = `<div class="empty">Failed to load leaderboard.</div>`;
});