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

  // Make sure the bar is a real stacking context
  bar.style.position = "relative";
  bar.style.overflow = "hidden";

  // Fill sits under stripes
  fill.style.position = "absolute";
  fill.style.inset = "0 auto 0 0";
  fill.style.height = "100%";
  fill.style.zIndex = "1";

  const totalStripes = Math.max(1, Number(stripes));
  const tierCap = Math.max(1, Number(capXP));
  const tierXP = Math.max(0, Number(xpInTier));
  const earned = Math.max(0, Math.min(totalStripes, Number(stripesEarned)));

  const pct = Math.round((tierXP / tierCap) * 100);
  const isAtCap = tierXP >= tierCap;

  // Fill
  const start = beltStart || "#FFD700";
  const end = beltEnd || start;
  fill.style.background = `linear-gradient(90deg, ${start}, ${end})`;
  fill.style.width = isAtCap ? "100%" : `${pct}%`;

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

  if (txt) {
    txt.textContent = `Stripes: ${earned}/${totalStripes}`;
  }
}
/**
 * One-call updater
 */
export function updateRankUI({
  ladder,
  totalXP,
  rankNameOverride = "",
  stripeCountOverride = null,
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

  const tierName = String(rankNameOverride || tier?.name || "").trim();
  const key = colorKeyFor(tierName) || "apprentice";
  const c = COLORS[key] || COLORS.apprentice;

  const earned = Number.isFinite(Number(stripeCountOverride))
    ? Number(stripeCountOverride)
    : stripesEarned;

  const isWhite =
    key === "legend" ||
    key === "hero" ||
    tierName.toLowerCase() === "mastery";

  drawRankBar({
    bar: document.getElementById(el.barId),
    fill: document.getElementById(el.fillId),
    txt: document.getElementById(el.textId),
    stripes: stripesTotal,
    capXP,
    xpInTier,
    beltStart: c.start,
    beltEnd: c.end,
    stripeTone: isWhite ? "white" : "black",
    stripesEarned: earned,
  });
}