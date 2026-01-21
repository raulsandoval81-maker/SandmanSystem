// /assets/js/belt-bar.js
// Belt bar helper – shared by Teen + Youth pages (single owner)

import { getStripeInfo, COLORS, colorKeyFor } from "./ladder.service.js";

/** Ensure we have N stripe boxes inside the bar */
function ensureStripeBoxes(bar, count = 4) {
  if (!bar) return null;

  let wrap = bar.querySelector(".stripe-boxes");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "stripe-boxes";
    bar.appendChild(wrap);
  }

  // 🔒 FORCE layout inline so CSS cannot override
  wrap.style.position = "absolute";
  wrap.style.left = "10px";
  wrap.style.right = "auto";
  wrap.style.top = "50%";
  wrap.style.transform = "translateY(-50%)";
  wrap.style.display = "flex";
  wrap.style.gap = "6px";
  wrap.style.zIndex = "5";
  wrap.style.pointerEvents = "none";

  // ensure correct count
  const existing = wrap.querySelectorAll(".stripe-box").length;

  for (let i = existing; i < count; i++) {
    const box = document.createElement("div");
    box.className = "stripe-box";
     // 👇 GHOST BASELINE (always visible, even before earned)
  box.style.width = "10px";
  box.style.height = "10px";
  box.style.borderRadius = "3px";
  box.style.background = "rgba(255,255,255,.10)";
  box.style.border = "1px solid rgba(255,255,255,.35)";

    wrap.appendChild(box);
    
  }

  while (wrap.querySelectorAll(".stripe-box").length > count) {
    wrap.removeChild(wrap.lastChild);
  }

  return wrap;
}

/** Draw/refresh the belt-style progress bar */
export function drawRankBar({
  bar,
  fill,
  txt,
  stripes = 4,
  capXP = 800,
  xpInTier = 0,
  beltStart,
  beltEnd,
  stripeTone = "white", // "white" | "black"
  stripesEarned = 0,
}) {
  if (!bar || !fill) return;

  const totalStripes = Math.max(1, Number(stripes) || 4);
  const tierCap = Math.max(1, Number(capXP) || 1);
  const tierXP = Math.max(0, Number(xpInTier) || 0);
  const earned = Math.max(0, Math.min(totalStripes, Number(stripesEarned) || 0));

  // stripe tone (CSS var used by CSS)
  bar.style.setProperty("--stripe", stripeTone === "black" ? "#000" : "#fff");

  // fill gradient
  const start = beltStart || "#FFD700";
  const end = beltEnd || start;
  fill.style.background = `linear-gradient(90deg, ${start}, ${end})`;

  // % within tier
  const pct = Math.max(0, Math.min(100, (tierXP / tierCap) * 100));
  fill.style.width = `${pct}%`;

  // boundary ticks (between stripe segments)
  bar.querySelectorAll(".progress-tick").forEach((n) => n.remove());
  for (let i = 1; i < totalStripes; i++) {
    const tick = document.createElement("div");
    tick.className = "progress-tick";
    tick.style.left = `${(i / totalStripes) * 100}%`;
    bar.appendChild(tick);
  }

  // earned boundaries (if earned=1 => 0 boundaries crossed; earned=2 => 1 boundary crossed...)
  const earnedBoundaries = Math.max(0, earned - 1);
  bar.querySelectorAll(".progress-tick").forEach((tick, idx) => {
    tick.classList.toggle("earned", idx < earnedBoundaries);
  });

  // stripe boxes (visual “ghost” + filled)
const boxes = ensureStripeBoxes(bar, totalStripes);
if (boxes) {
  const onColor = stripeTone === "black" ? "#000" : "#fff";
  const offBg = "rgba(255,255,255,.10)";
  const offBorder = "rgba(255,255,255,.35)";

  [...boxes.children].forEach((node, i) => {
    const on = i < earned;
    node.classList.toggle("filled", on);
    node.style.background = on ? onColor : offBg;
    node.style.borderColor = on ? onColor : offBorder;
  });
}
  if (txt) txt.textContent = `Stripes: ${earned}/${totalStripes}`;
}

/** One-call UI updater – call on load and whenever totalXP changes */
export function updateRankUI({
  ladder,
  totalXP,
  el = {
    barId: "rankBar",
    fillId: "rankFill",
    textId: "stripeText",
    curId: "curTier",
    nextId: "nextTier",
  },
}) {
  const info = getStripeInfo(ladder, totalXP);
  if (!info?.tier) return;

  const {
    tier,
    nextTier,
    xpInTier = 0,
    capXP = 1,
    stripesTotal = 4,
    stripesEarned = 0,
  } = info;

  // colors
  const key = colorKeyFor(tier.name);
  const c = COLORS[key] || COLORS.apprentice;

  // stripe tone rule: white belts => black stripes, others => white
  const nameLower = String(tier.name || "").toLowerCase();
  const isWhiteBelt =
    key === "apprentice" || key === "shadow" || nameLower === "foundation";
  const stripeTone = isWhiteBelt ? "black" : "white";

  // elements
  const bar = document.getElementById(el.barId);
  const fill = document.getElementById(el.fillId);
  const txt = document.getElementById(el.textId);

  // labels
  const curEl = document.getElementById(el.curId);
  const nextEl = document.getElementById(el.nextId);
  if (curEl) curEl.textContent = tier.name;
  if (nextEl) nextEl.textContent = nextTier?.name || "(max)";

  // draw
  drawRankBar({
    bar,
    fill,
    txt,
    stripes: stripesTotal,
    capXP,
    xpInTier,
    beltStart: c.start,
    beltEnd: c.end,
    stripeTone,
    stripesEarned,
  });
}
