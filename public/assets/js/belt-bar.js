// /assets/js/belt-bar.js
// Belt bar helper – SINGLE OWNER for Combat UI text + visuals
// LOCKED DOCTRINE:
// Combat shows: Stripes x/4 · Progress y%
// No XP numbers. No duplicates. No leakage.

import { getStripeInfo, COLORS, colorKeyFor } from "./ladder.service.js";

/**
 * Ensure we have N vertical stripe bars inside the belt bar.
 * These are "ghost" stripes that always show, and fill as earned.
 */
function ensureStripeBars(bar, count = 4) {
  if (!bar) return null;

  let wrap = bar.querySelector(".stripe-bars");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "stripe-bars";
    bar.appendChild(wrap);
  }

  wrap.style.position = "absolute";
  wrap.style.inset = "0";
  wrap.style.display = "flex";
  wrap.style.justifyContent = "flex-start";
  wrap.style.alignItems = "stretch";
  wrap.style.gap = "10px";
  wrap.style.padding = "0 0 0 50px";
  wrap.style.pointerEvents = "none";
  wrap.style.zIndex = "6";

  const existing = wrap.querySelectorAll(".stripe-bar").length;

  for (let i = existing; i < count; i++) {
    const s = document.createElement("div");
    s.className = "stripe-bar";
    s.style.width = "20px";
    s.style.height = "100%";
    s.style.background = "rgba(255,255,255,.12)";
    s.style.border = "1px solid rgba(255,255,255,.20)";
    wrap.appendChild(s);
  }

  while (wrap.querySelectorAll(".stripe-bar").length > count) {
    wrap.removeChild(wrap.lastChild);
  }

  return wrap;
}

/**
 * Draw combat belt bar ONLY
 */
function drawRankBar({
  bar,
  fill,
  txt,
  stripes = 4,
  capXP = 1,
  xpInTier = 0,
  beltStart,
  beltEnd,
  stripeTone = "white",
  stripesEarned = 0,
} = {}) {
  if (!bar || !fill) return;

  const totalStripes = Math.max(1, Number(stripes));
  const tierCap = Math.max(1, Number(capXP));
  const tierXP = Math.max(0, Number(xpInTier));
  const earned = Math.max(0, Math.min(totalStripes, Number(stripesEarned)));

  const pct = Math.round((tierXP / tierCap) * 100);

  // Fill
  const start = beltStart || "#FFD700";
  const end = beltEnd || start;
  fill.style.background = `linear-gradient(90deg, ${start}, ${end})`;
  fill.style.width = `${pct}%`;

  // Stripe bars
  const stripesWrap = ensureStripeBars(bar, totalStripes);
  if (stripesWrap) {
    const onColor = stripeTone === "black" ? "#000" : "#fff";
    const offBg = "rgba(255,255,255,.12)";
    const offBorder = "rgba(255,255,255,.20)";

    [...stripesWrap.children].forEach((node, i) => {
      const on = i < earned;
      node.style.background = on ? onColor : offBg;
      node.style.borderColor = on ? onColor : offBorder;
    });
  }

  // 🔒 SINGLE TEXT LINE (LOCKED)
  if (txt) {
    txt.textContent = `Stripes: ${earned}/${totalStripes} · Progress: ${pct}%`;
  }
}

/**
 * One-call updater
 */
export function updateRankUI({
  ladder,
  totalXP,
  el = {
    barId: "rankBar",
    fillId: "rankFill",
    textId: "stripeText",
  },
} = {}) {
  const info = getStripeInfo(ladder, totalXP);
  if (!info?.tier) return;

  const {
    tier,
    xpInTier = 0,
    capXP = 1,
    stripesTotal = 4,
    stripesEarned = 0,
  } = info;

  const key = colorKeyFor(tier.name);
  const c = COLORS[key] || COLORS.apprentice;

  const isWhite =
    key === "apprentice" ||
    key === "shadow" ||
    String(tier.name).toLowerCase() === "foundation";

  drawRankBar({
    bar: document.getElementById(el.barId),
    fill: document.getElementById(el.fillId),
    txt: document.getElementById(el.textId),
    stripes: stripesTotal,
    capXP,
    xpInTier,
    beltStart: c.start,
    beltEnd: c.end,
    stripeTone: isWhite ? "black" : "white",
    stripesEarned,
  });
}
