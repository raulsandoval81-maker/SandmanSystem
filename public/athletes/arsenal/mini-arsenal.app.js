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

const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

let athlete = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmpty(message) {
  if (!badgeWall) return;

  badgeWall.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function normalizeBadgeLabel(item, fallback = "Earned Badge") {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return fallback;

  return (
    item.title ||
    item.label ||
    item.name ||
    item.badgeName ||
    fallback
  );
}

function renderBadges(items, emptyMessage = "No badges to show yet.") {
  if (!badgeWall) return;

  if (!Array.isArray(items) || !items.length) {
    renderEmpty(emptyMessage);
    return;
  }

  badgeWall.innerHTML = items
    .slice(0, 24)
    .map((item, index) => {
      const label = normalizeBadgeLabel(item, `Earned Badge ${index + 1}`);
      return `<div class="badge-chip">${escapeHtml(label)}</div>`;
    })
    .join("");
}

function openCombat() {
  if (!athleteId) return;

  window.location.href =
    `/athletes/arsenal/combat/youth/?id=${encodeURIComponent(athleteId)}`;
}

function openStrength() {
  if (!panelEyebrow || !panelTitle || !panelText) return;

  panelEyebrow.textContent = "Acts of Strength";
  panelTitle.textContent = "Acts of Strength";
  panelText.textContent =
    "Coach-recognized moments of effort, toughness, and discipline.";

  const items = athlete?.actsOfStrength || [];
  renderBadges(items, "No Acts of Strength badges earned yet.");
}

function openHonor() {
  if (!panelEyebrow || !panelTitle || !panelText) return;

  panelEyebrow.textContent = "Acts of Honor";
  panelTitle.textContent = "Acts of Honor";
  panelText.textContent =
    "Coach-recognized moments of respect, character, and leadership.";

  const items = athlete?.actsOfHonor || [];
  renderBadges(items, "No Acts of Honor badges earned yet.");
}

function wireCards() {
  $("combatCard")?.addEventListener("click", openCombat);
  $("strengthCard")?.addEventListener("click", openStrength);
  $("honorCard")?.addEventListener("click", openHonor);
}

async function loadAthlete() {
  if (!athleteId) {
    if (athleteLabel) athleteLabel.textContent = "No athlete id provided.";
    renderEmpty("Missing athlete id.");
    return;
  }

  if (homeBtn) {
    homeBtn.href = `/athletes/hub/mini-hub.html?id=${encodeURIComponent(athleteId)}`;
  }

  if (athleteLabel) {
    athleteLabel.textContent = athleteId;
  }

  // Safety guard:
  // Mini Arsenal should only serve F8 athletes.
  if (!athleteId.startsWith("F8_")) {
    window.location.replace(
      `/athletes/arsenal/arsenal.html?id=${encodeURIComponent(athleteId)}`
    );
    return;
  }

  try {
    await ensureSignedIn();

    const athleteRef = doc(db, "athletes", athleteId);
    const athleteSnap = await getDoc(athleteRef);

    if (!athleteSnap.exists()) {
      console.error("Athlete not found:", athleteId);
      if (athleteLabel) athleteLabel.textContent = athleteId;
      renderEmpty("Athlete not found.");
      return;
    }

    athlete = athleteSnap.data() || {};

    const displayName =
      athlete.displayName ||
      athlete.athleteName ||
      athlete.name ||
      athlete.fullName ||
      athleteId;

    if (athleteLabel) {
      athleteLabel.textContent = displayName;
    }

    openCombat();
  } catch (err) {
    console.error("mini-arsenal load failed:", err);
    if (athleteLabel) athleteLabel.textContent = athleteId;
    renderEmpty("Could not load athlete.");
  }
}

wireCards();
await loadAthlete();