// public/assets/js/xp-ui.js

export function applyXpResultToAthleteRow(a, res) {
  if (!a || !res) return;

  // Blocked = no local mutation
  if (res.blocked) {
    a._lastBlocked = { reason: res.reason || "BLOCKED", at: Date.now() };
    return;
  }

  // Server truth
  if (typeof res.afterXp === "number") a.xp = res.afterXp;
  if (typeof res.cap === "number") a.xpCap = res.cap;

  if (res.tier != null) a.tier = res.tier;
  if (res.base != null) a.base = res.base;

  if (typeof res.stripeCount === "number") a.stripeCount = res.stripeCount;

  a._lastOk = { delta: res.delta ?? null, at: Date.now() };
}
