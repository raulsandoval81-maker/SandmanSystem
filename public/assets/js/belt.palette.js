// assets/js/belt.palette.js
// ------------------------------------------------------------
// Belt Palette (canonical)
// - Youth (Foundry8): Shadow → Hero
// - Teen (Foundry4 Combat): Apprentice → Legend
// - Adult (Foundry4): Foundation → Mastery   (same colors as Teen)
// Colors: WHITE / BLUE / PURPLE / BROWN / BLACK
// ------------------------------------------------------------

// ---------- Core color swatches ----------
const WHITE  = { text:"#000000", bandStart:"#FFFFFF", bandEnd:"#EAEAEA", outline:"#000000" }; // white belt
const BLUE   = { text:"#FFFFFF", bandStart:"#2196F3", bandEnd:"#0D47A1", outline:"#000000" }; // blue belt
const PURPLE = { text:"#FFFFFF", bandStart:"#9C27B0", bandEnd:"#4A148C", outline:"#000000" }; // purple belt
const BROWN  = { text:"#FFFFFF", bandStart:"#6D4C41", bandEnd:"#3E2723", outline:"#000000" }; // brown belt
const BLACK  = { text:"#FFFFFF", bandStart:"#000000", bandEnd:"#000000", outline:"#FFFFFF" }; // black belt w white rim

// ---------- Youth (Foundry8) ----------
export const BELT_YOUTH = {
  Shadow:     WHITE,
  Recruit:    { text:"#000000", bandStart:"#FFD54F", bandEnd:"#FFA000", outline:"#000000" }, // yellow
  Combatant:  { text:"#FFFFFF", bandStart:"#FF7043", bandEnd:"#D84315", outline:"#000000" }, // orange
  Competitor: { text:"#FFFFFF", bandStart:"#4CAF50", bandEnd:"#1B5E20", outline:"#000000" }, // green
  Warrior:    BLUE,
  Champion:   PURPLE,
  Commander:  BROWN,
  Hero:       BLACK, // youth cap
};

// ---------- Teen (Foundry4 Combat) ----------
export const BELT_F4 = {
  Apprentice: WHITE,
  Warrior:    BLUE,
  Champion:   PURPLE,
  Veteran:    BROWN,
  Legend:     BLACK, // teen cap
};

// ---------- Adult (Foundry4: Foundation → Mastery) ----------
// NOTE: These are the SAME colors as Teen F4, just renamed ranks.
export const BELT_ADULT = {
  Foundation:  WHITE,
  Development: BLUE,
  Integration: PURPLE,
  Refinement:  BROWN,
  Mastery:     BLACK, // adult cap
};

// ---------- Name normalization (handles aliases + casing) ----------
export function normalizeTierName(tierName = "") {
  const raw = String(tierName ?? "").trim();
  const t = raw.toLowerCase();

  // aliases / typos / legacy
  if (t === "jr legend" || t === "junior legend") return "Hero";     // if old label ever appears
  if (t === "deployment") return "Refinement";                       // support typo seen in chat
  if (t === "dev") return "Development";
  if (t === "foundations") return "Foundation";

  // Title Case (single word) + preserve multi-word keys
  // "sandman" -> "Sandman", "path 2 legend" -> "Path 2 legend" (not used here)
  return raw
    .split(/\s+/g)
    .map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : w)
    .join(" ");
}

// ---------- Main API: get colors for belt by tier + track ----------
export function beltColorsFor({ tierName, track = "youth" }) {
  const key = normalizeTierName(tierName);

  // track routing
  if (track === "adult") {
    return BELT_ADULT[key] || BELT_ADULT.Foundation;
  }
  if (track === "f4" || track === "teen") {
    return BELT_F4[key] || BELT_F4.Apprentice;
  }
  // default youth
  return BELT_YOUTH[key] || BELT_YOUTH.Shadow;
}

// ---------- Inline style helper (for bars, chips, cards) ----------
export function beltStyleFor({ tierName, track = "youth" }) {
  const c = beltColorsFor({ tierName, track });
  return `
    --text:${c.text};
    --bandStart:${c.bandStart};
    --bandEnd:${c.bandEnd};
    --outline:${c.outline};
    color:${c.text};
    background:linear-gradient(90deg, ${c.bandStart}, ${c.bandEnd});
    border:2px solid ${c.outline};
  `;
}
