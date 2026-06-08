// /assets/js/xp-bar-mini.js
// tiny row-style belt/xp bar for roster/clipboard tables

// optional: map tier/rank names → colors
const MINI_TIER_COLORS = {
  shadow:     "#ffffff",
  recruit:    "#facc15",
  combatant:  "#fb923c",
  competitor: "#22c55e",
  warrior:    "#3b82f6",
  champion:   "#a855f7",
  commander:  "#92400e",
  sandman:    "#eab308",
  hero:       "#000000",
  apprentice: "#ffffff",
  veteran:    "#92400e",
  legend:     "#000000"
};

function colorForTier(name = "") {
  const k = String(name).toLowerCase().trim();
  return MINI_TIER_COLORS[k] || "#ef4444"; // fallback red
}

// fallback only if caller does not pass stripeTone
function stripeToneFor(hex = "") {
  return String(hex).toLowerCase() === "#ffffff" ? "black" : "white";
}

// main render
export function renderMiniXpBar({
  container,
  xp = 0,
  cap = 1000,
  tierName = "Apprentice",
  stripesEarned = 0,
  stripesTotal = 4,
  fillColor = "",
  stripeTone = ""
} = {}) {
  if (!container) return;

  const baseColor = fillColor || colorForTier(tierName);
  const pct = Math.min(100, Math.round((xp / Math.max(1, cap)) * 100));
  const tone = stripeTone || stripeToneFor(baseColor);

  // build stripe boxes
  const stripes = Array.from({ length: stripesTotal }).map((_, i) => {
    const filled = i < stripesEarned;
    return `
      <span class="mini-stripe ${tone} ${filled ? "filled" : ""}"></span>
    `;
  }).join("");

  container.innerHTML = `
    <div class="mini-xp-bar">
      <div class="mini-xp-base" style="background:${baseColor};"></div>
      <div class="mini-xp-fill" style="width:${pct}%;background:${baseColor};"></div>
      <div class="mini-stripes">${stripes}</div>
    </div>
  `;
}