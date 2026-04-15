// Belt bar helper – shared by Teen + Youth pages
// ------------------------------------------------
import { getStripeInfo } from "./ladder.service.js";
import { COLORS, colorKeyFor } from "./belt.palette.js";
import { LADDER_F4 } from "./ladder.service.js";
//import { updateRankUI } from "./belt-bar.js";

// whenever totalXP changes (and on load):
function renderTotals(totalXP = 0) {
  // ...your existing totals UI updates...
  updateRankUI({ ladder: LADDER_F4, totalXP });
}

/** Draw/refresh the belt-style progress bar */
export function drawRankBar({ bar, fill, txt, stripes = 4, capXP = 800, xpInTier = 0, beltColor = "#FFD700" }) {
  if (!bar || !fill) return;

  // adopt belt color (CSS var used in belts.css)
  bar.style.setProperty("--belt", beltColor);

  // % within current tier
  const pct = Math.max(0, Math.min(100, (xpInTier / Math.max(1, capXP)) * 100));
  fill.style.width = `${pct}%`; // left → right

  // ticks at stripe boundaries
  bar.querySelectorAll(".progress-tick").forEach(n => n.remove());
  for (let i = 1; i < stripes; i++) {
    const tick = document.createElement("div");
    tick.className = "progress-tick";
    tick.style.left = `${(i / stripes) * 100}%`;
    bar.appendChild(tick);
  }

  // stripe count label
  if (txt) {
    const earned = Math.floor((xpInTier / Math.max(1, capXP)) * stripes);
    txt.textContent = `Stripes: ${earned}/${stripes}`;
  }
}

/** One-call UI updater – call on load and whenever totalXP changes */
export function updateRankUI({
  ladder,            // LADDER_F4 or LADDER_YOUTH
  totalXP,           // athlete's total XP
  el = {             // element ids (use your existing ids)
    barId: "rankBar",
    fillId: "rankFill",
    textId: "stripeText",
    curId: "curTier",
    nextId: "nextTier"
  }
}) {
  const info = getStripeInfo(ladder, totalXP);
  const { tier, xpInTier, capXP } = info;

  // belt color by tier name
  const key = colorKeyFor(tier.name);
  const beltColor = (COLORS[key]?.bandStart) || "#FFD700";

  // elements
  const bar  = document.getElementById(el.barId);
  const fill = document.getElementById(el.fillId);
  const txt  = document.getElementById(el.textId);

  // labels (optional)
  const curEl  = document.getElementById(el.curId);
  const nextEl = document.getElementById(el.nextId);
  if (curEl)  curEl.textContent  = tier.name;
  if (nextEl) nextEl.textContent = info.nextTier?.name || "(max)";

  // draw
  drawRankBar({
    bar, fill, txt,
    stripes: tier.stripes || 4,
    capXP, xpInTier, beltColor
  });
}
// pick belt color for current tier
const key = colorKeyFor(tier.name);           // e.g., "warrior"
const beltColor = COLORS[key]?.bandStart || "#FFD700";

// update the progress bar with that color
drawRankBar({
  bar, fill, txt,
  stripes: tier.stripes || 4,
  capXP, xpInTier, beltColor
});

// ALSO: show a little color badge or style the text
const curEl = document.getElementById(el.curId);
if (curEl) {
  curEl.textContent = tier.name;
  curEl.style.color = beltColor;   // make the label match the belt
}
