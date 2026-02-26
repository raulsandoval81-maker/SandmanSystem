/* global window, AthleteService, AthleteValidators */
(function () {
  const KEY = "athleteWeekly"; // localStorage bucket

  function normalizeWeek(w) {
    return AthleteValidators.validateWeek(w) ? w : AthleteValidators.isoWeekString();
  }

  function filterWeekly(list, q = {}) {
    const a = (q.athlete || "").toLowerCase();
    const c = (q.coach || "").toLowerCase();
    const p = q.program || "";
    const d = q.discipline || "";
    const from = q.weekFrom || "";
    const to = q.weekTo || "";
    return list.filter(e => {
      if (a && !(e.athlete || "").toLowerCase().includes(a)) return false;
      if (c && !(e.coach || "").toLowerCase().includes(c)) return false;
      if (p && e.program !== p) return false;
      if (d && e.discipline !== d) return false;
      if (from && (e.week || "") < from) return false;
      if (to && (e.week || "") > to) return false;
      return true;
    }).sort((x, y) => (y.week || "").localeCompare(x.week || "") || (y.ts || 0) - (x.ts || 0));
  }

  // ---- Public API (local first; Firestore later via AthleteService.USE_FIREBASE) ----
  function save(entry) {
    entry.week = normalizeWeek(entry.week);
    entry.ts = Number.isFinite(entry.ts) ? entry.ts : Date.now();
    AthleteValidators.assertWeekly(entry);

    if (AthleteService.USE_FIREBASE) {
      // return AthleteService.fsUpsert("weekly", entry);
      throw new Error("Firestore not enabled");
    } else {
      const list = AthleteService.lsGet(KEY);
      // de-dup by (athlete + week)
      const i = list.findIndex(e =>
        (e.week === entry.week) &&
        ((e.athlete || "").toLowerCase() === (entry.athlete || "").toLowerCase())
      );
      entry.id = entry.id || AthleteService.genId("wk");
      if (i >= 0) list[i] = entry; else list.unshift(entry);
      AthleteService.lsSet(KEY, list);
      return entry.id;
    }
  }

  function list(filters = {}, paging = { page: 1, size: 50 }) {
    if (AthleteService.USE_FIREBASE) {
      // return AthleteService.fsList("weekly", filters, paging);
      throw new Error("Firestore not enabled");
    } else {
      const all = filterWeekly(AthleteService.lsGet(KEY), filters);
      const page = Math.max(1, parseInt(paging.page || 1, 10));
      const size = Math.max(1, parseInt(paging.size || 50, 10));
      const start = (page - 1) * size;
      return {
        total: all.length,
        page, size,
        rows: all.slice(start, start + size)
      };
    }
  }

  function remove(id) {
    if (!id) return false;
    if (AthleteService.USE_FIREBASE) {
      // return AthleteService.fsRemove("weekly", id);
      throw new Error("Firestore not enabled");
    } else {
      const list = AthleteService.lsGet(KEY);
      const filtered = list.filter(e => e.id !== id);
      AthleteService.lsSet(KEY, filtered);
      return list.length !== filtered.length;
    }
  }

  window.AthleteWeeklyService = { save, list, remove, normalizeWeek };
})();
