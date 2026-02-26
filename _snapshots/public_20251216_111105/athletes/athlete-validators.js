/* global window */
(function () {
  const WEEK_RE = /^\d{4}-W\d{2}$/; // e.g., 2025-W37

  function sanitizeText(s) {
    return (s == null ? "" : String(s)).trim();
  }
  function toInt(n, def = 0) {
    const v = Number.parseInt(n, 10);
    return Number.isFinite(v) ? v : def;
  }
  function toFloat(n, def = 0) {
    const v = Number.parseFloat(n);
    return Number.isFinite(v) ? v : def;
  }
  function clampInt(n, min, max) {
    n = toInt(n, min);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }
  function validateWeek(str) {
    return WEEK_RE.test(String(str || ""));
  }
  function isoWeekString(d = new Date()) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  // Schema guards (throwing is intentional during dev)
  function assertWeekly(entry) {
    if (!entry) throw new Error("weekly entry required");
    if (!validateWeek(entry.week)) throw new Error("invalid week (YYYY-Www)");
    if (!sanitizeText(entry.athlete)) throw new Error("athlete required");
    entry.sessions = clampInt(entry.sessions, 0, 99);
    entry.hours = toFloat(entry.hours, 0);
    entry.matches = clampInt(entry.matches, 0, 999);
    entry.wins = clampInt(entry.wins, 0, 999);
    entry.program = sanitizeText(entry.program || "foundry8");
    entry.discipline = sanitizeText(entry.discipline || "wrestling");
    entry.coach = sanitizeText(entry.coach || "");
    entry.focus = sanitizeText(entry.focus || "");
    entry.notes = sanitizeText(entry.notes || "");
    return entry;
  }

  function assertLive(entry) {
    if (!entry) throw new Error("live log entry required");
    if (!sanitizeText(entry.athlete)) throw new Error("athlete required");
    entry.type = sanitizeText(entry.type || "session"); // session|match|spar
    entry.result = sanitizeText(entry.result || "—");
    entry.durationMin = clampInt(entry.durationMin, 0, 600);
    entry.program = sanitizeText(entry.program || "foundry8");
    entry.discipline = sanitizeText(entry.discipline || "wrestling");
    entry.coach = sanitizeText(entry.coach || "");
    entry.opponent = sanitizeText(entry.opponent || "");
    entry.note = sanitizeText(entry.note || "");
    entry.ts = Number.isFinite(entry.ts) ? entry.ts : Date.now();
    return entry;
  }

  window.AthleteValidators = {
    sanitizeText, toInt, toFloat, clampInt,
    validateWeek, isoWeekString, assertWeekly, assertLive
  };
})();
