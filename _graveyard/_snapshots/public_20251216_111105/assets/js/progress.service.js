// public/assets/js/progress.service.js
// Lightweight progress math shared by Youth + Teen/Foundry4

// --- utils
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const round = (n) => Math.round(n);

// Determine how many stripes this tier uses and its visual thresholds
export function getStripePlan(tierKey = "", isYouth = false) {
  const key = String(tierKey || "").toLowerCase().trim();
  const stripesTotal = (isYouth && key === "shadow") ? 3 : 4; // Youth Shadow = 3, else 4
  const thresholds = (stripesTotal === 3) ? [33, 66, 100] : [25, 50, 75, 100];
  return { stripesTotal, thresholds };
}

/**
 * calcProgress
 * @param {number} totalXP  - Athlete total XP (global running total)
 * @param {number} startXP  - Tier start XP (inclusive)
 * @param {number} capXP    - Tier cap XP (exclusive upper bound for this tier)
 * @param {string} tierKey  - Lower-cased tier name ("shadow", "apprentice", etc.)
 * @param {boolean} isYouth - Youth rules toggle (Shadow = 3 stripes)
 * @returns {{
 *   pct: number,                 // 0..100 within the current tier
 *   xpInTier: number,            // XP earned since entering tier
 *   span: number,                // cap - start
 *   stripesTotal: number,        // 3 or 4
 *   stripesEarned: number,       // how many thresholds crossed
 *   nextStripeXP: number,        // XP remaining to next stripe (0 if capped or none)
 *   thresholds: number[],        // [25,50,75,100] or [33,66,100]
 *   status: string               // "Stripes 2/4 • 120 XP to next stripe"
 * }}
 */
export function calcProgress(totalXP, startXP, capXP, tierKey = "", isYouth = false) {
  const start = Number.isFinite(startXP) ? startXP : 0;
  const cap   = Number.isFinite(capXP) ? capXP : start + 1;
  const span  = Math.max(1, cap - start);
  const xpInTier = Math.max(0, totalXP - start);

  // Percent within the tier (can exceed 100; clamp for display)
  const pct01 = clamp01(xpInTier / span);
  const pct   = pct01 * 100;

  // Stripe plan
  const { stripesTotal, thresholds } = getStripePlan(tierKey, isYouth);

  // Earned stripes: floor(pct / (100/stripesTotal))
  const step = 100 / stripesTotal;
  const stripesEarned = Math.max(0, Math.min(stripesTotal, Math.floor(pct / step)));

  // Next stripe distance (in XP)
  let nextStripeXP = 0;
  if (stripesEarned < stripesTotal) {
    const nextStripePct = (stripesEarned + 1) * step;          // e.g., 25, 50, 75, 100
    const remainPct = Math.max(0, nextStripePct - pct);         // percentage points
    nextStripeXP = Math.max(0, Math.round((remainPct / 100) * span));
  }

  // Friendly status line (no “next tier” text here; the page prints that elsewhere)
  const statusParts = [`Stripes ${stripesEarned}/${stripesTotal}`];
  if (stripesEarned < stripesTotal) statusParts.push(`${nextStripeXP} XP to next stripe`);
  const status = statusParts.join(" • ");

  return {
    pct: round(pct),
    xpInTier,
    span,
    stripesTotal,
    stripesEarned,
    nextStripeXP,
    thresholds,
    status,
  };
}
// progress.service.js
// Core math. No DOM. Reusable across Youth/Teen/Adult.

export function computeProgress({ ladder, totalXP, thresholdsFor }) {
  if (!Array.isArray(ladder) || ladder.length === 0) {
    throw new Error("[progress] ladder missing");
  }
  const i = ladder.findIndex((t, idx) => {
    const next = ladder[idx + 1];
    return totalXP >= t.start && (!next || totalXP < next.start);
  });
  const tier = i >= 0 ? ladder[i] : ladder[0];
  const nextTier = ladder[i + 1] || null;

  const start = tier.start ?? 0;
  const cap   = nextTier ? nextTier.start : (tier.cap ?? start); // final tier has no next
  const span  = Math.max(1, (cap - start));                       // avoid /0
  const xpIn  = Math.max(0, totalXP - start);
  const pct   = nextTier ? Math.max(0, Math.min(100, (xpIn / span) * 100)) : 100;

  // Stripe thresholds in percentages (e.g., [25,50,75,100])
  const thresholds = nextTier ? (thresholdsFor?.(tier.key || tier.name?.toLowerCase()) || [25,50,75,100]) : [];
  const stripesTotal  = thresholds.length;
  const stripesEarned = thresholds.reduce((n, t) => n + (pct >= t ? 1 : 0), 0);

  const xpPerStripe = stripesTotal > 0 ? span / stripesTotal : 0;
  const xpToNextStripe = (stripesTotal > 0 && stripesEarned < stripesTotal)
    ? Math.max(0, Math.ceil((thresholds[stripesEarned] / 100) * span) - xpIn)
    : 0;

  const xpToNextTier = nextTier ? Math.max(0, span - xpIn) : 0;

  const isFinal  = !nextTier;
  const isReady  = !isFinal && pct >= 100 && stripesEarned >= stripesTotal;
  const isCapped = !isFinal && pct >= 100 && !isReady;

  return {
    // identity
    tierName: tier.name,
    tierKey:  tier.key || tier.name?.toLowerCase(),
    nextTierName: nextTier?.name || null,

    // numeric
    start, cap, span,
    totalXP, xpIn,
    percent: Math.round(pct),

    // stripes
    thresholds,            // e.g., [25,50,75,100] or [33,66,100]
    stripesEarned,
    stripesTotal,
    xpPerStripe,
    xpToNextStripe,

    // promotion
    xpToNextTier,
    isFinal, isReady, isCapped,
  };
}
