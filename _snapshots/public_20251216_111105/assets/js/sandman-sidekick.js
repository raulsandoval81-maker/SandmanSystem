// Sandman Sidekick™ — placeholder (Phase 38–44)
// Safe by default: no network, no Firebase, no writes.
// Flip on later (Phase 45+) via setSidekick(true).

let _ON = false;

export const SIDEKICK = Object.freeze({
  name: "Sandman Sidekick™",
  version: "0.1.0-placeholder",
  isOn: () => _ON
});

/** Enable/disable the sidekick (manual switch). */
export function setSidekick(on = true) {
  _ON = !!on;
  _log(`Sidekick ${_ON ? "ENABLED" : "DISABLED"}.`);
}

/** Optional: attach to a status element by id (coach-only UI). */
export function bindStatus(elId = "sidekick") {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = _ON
    ? "Sandman Sidekick™ is ON (placeholder)"
    : "Sandman Sidekick™ is OFF (placeholder)";
}

/** Analyze a batch of XP entries (placeholder, no AI). */
export function analyzeXpBatch(entries = [], opts = {}) {
  if (!_ON) return [];
  // Minimal, deterministic hints (no AI, no writes)
  const notes = [];
  const weekTotal = Number(opts.weekTotal || 0);
  const nextStripeAt = Number(opts.nextStripeAt ?? NaN);

  if (weekTotal > 30) notes.push("⚠️ Weekly attendance cap (30 XP) exceeded.");
  // naive duplicate detector by (date|category|xp)
  const seen = new Set();
  for (const e of entries) {
    const k = `${e?.date || ""}|${e?.category || ""}|${e?.xp || 0}`;
    if (seen.has(k)) notes.push(`⚠️ Possible duplicate: ${e?.category} ${e?.xp} on ${e?.date}`);
    seen.add(k);
  }
  if (!Number.isNaN(nextStripeAt)) {
    const batch = entries.reduce((s, e) => s + (Number(e?.xp) || 0), 0);
    const toStripe = Math.max(0, nextStripeAt - (weekTotal + batch));
    if (toStripe <= 100) notes.push(`💡 ${toStripe} XP to next stripe.`);
  }
  return notes;
}

/** Simple weekly summary generator (placeholder, no AI). */
export function weeklySummary(stats = { practices: 0, tournaments: 0, xp: 0 }) {
  if (!_ON) return "";
  const p = Number(stats.practices || 0);
  const t = Number(stats.tournaments || 0);
  const x = Number(stats.xp || 0);
  return `This week: ${p} practice${p===1?"":"s"}, ${t} tournament${t===1?"":"s"}, +${x} XP.`;
}

/** Coach insights from totals (placeholder). */
export function insightsFromTotals(totals = new Map()) {
  if (!_ON) return [];
  // Expect Map<athleteId, totalXP>
  const arr = Array.from(totals.entries())
    .map(([id, xp]) => ({ id, xp: Number(xp || 0) }))
    .sort((a, b) => b.xp - a.xp);
  if (!arr.length) return [];
  const notes = [];
  notes.push(`🏁 Leader: ${arr[0].id} (${arr[0].xp} XP)`);
  if (arr[1]) notes.push(`🥈 Next: ${arr[1].id} (${arr[1].xp} XP)`);
  return notes;
}

/** Internal log helper (quiet unless enabled). */
function _log(...args) {
  if (_ON) console.log("[Sandman Sidekick]", ...args);
}
