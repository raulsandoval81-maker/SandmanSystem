/* ============================================================================
  Athlete Live Service (no modules)  —  /public/athletes/athlete.live.service.js
  Purpose: CRUD + query for live session/match logs.
  Storage (demo): localStorage under KEY = "athleteLiveLog".
  Attach: window.AthleteLiveService
============================================================================ */

(function (global) {
  "use strict";

  var KEY = "athleteLiveLog"; // localStorage bucket

  // ---- Public API -----------------------------------------------------------
  var api = {
    // Schema helper (doc shape)
    createEntry: createEntry,

    // CRUD (local demo)
    save: save,                  // upsert
    getById: getById,
    remove: remove,
    list: list,                  // filters + paging
    count: count,

    // Utilities
    wipeLocal: wipeLocal,
    _debugLoad: _loadAll,        // for testing UI
    _debugReplaceAll: _replaceAll
  };

  // expose
  global.AthleteLiveService = api;

  // ---- Implementation -------------------------------------------------------

  /**
   * Factory for a normalized entry (live session / match).
   * @param {Object} p
   * @returns {Object} entry
   *
   * Fields:
   *  id            string (generated if missing)
   *  ts            number (ms since epoch, saved time)
   *  date          string 'YYYY-MM-DD' (session date)
   *  athlete       string (slug or name)
   *  coach         string
   *  program       'foundry8' | 'foundry4' | 'leadership'
   *  discipline    'wrestling' | 'striking' | 'kickboxing' | 'muay-thai' | 'submission-grappling' | 'mma' | string
   *  type          'practice' | 'match' | 'tournament' | string
   *  durationMin   number
   *  rating        number (0–5) optional quick score
   *  note          string
   *  meta          object (free-form: venue, opponent, weight, etc.)
   */
  function createEntry(p) {
    var now = Date.now();
    return {
      id: p && p.id ? String(p.id) : uid(),
      ts: p && p.ts ? +p.ts : now,
      date: (p && p.date) ? String(p.date) : isoDate(new Date()),
      athlete: (p && p.athlete || "").trim(),
      coach: (p && p.coach || "").trim(),
      program: (p && p.program) || "foundry8",
      discipline: (p && p.discipline) || "wrestling",
      type: (p && p.type) || "practice",
      durationMin: num(p && p.durationMin, 0),
      rating: num(p && p.rating, null),
      note: (p && p.note || "").trim(),
      meta: p && typeof p.meta === "object" ? p.meta : {}
    };
  }

  /** Upsert one entry. Returns saved entry. */
  function save(entry) {
    var e = createEntry(entry);
    var all = _loadAll();
    var i = all.findIndex(function (x) { return x.id === e.id; });
    if (i >= 0) all[i] = e; else all.unshift(e);
    _persist(all);
    return e;
  }

  /** Get by id (or null). */
  function getById(id) {
    var all = _loadAll();
    return all.find(function (x) { return x.id === id; }) || null;
  }

  /** Remove by id. Returns true if removed. */
  function remove(id) {
    var all = _loadAll();
    var n = all.length;
    all = all.filter(function (x) { return x.id !== id; });
    _persist(all);
    return all.length !== n;
  }

  /**
   * List with filters + paging.
   * @param {Object} q
   *    q.athlete, q.coach, q.program, q.discipline (strings, case-insensitive contains for athlete/coach)
   *    q.type ('practice'|'match'|...)
   *    q.from, q.to  (date 'YYYY-MM-DD' inclusive)
   *    q.search      (search notes/meta JSON string)
   *    q.sort        ('date_desc' default | 'date_asc' | 'ts_desc' | 'ts_asc')
   *    q.page        (1-based)  q.pageSize (default 25)
   * @returns {Object} { rows, total, page, pageSize, pages }
   */
  function list(q) {
    q = q || {};
    var page = Math.max(1, +q.page || 1);
    var size = Math.max(1, +q.pageSize || 25);
    var A = (q.athlete || "").toLowerCase();
    var C = (q.coach || "").toLowerCase();
    var P = q.program || "";
    var D = q.discipline || "";
    var T = q.type || "";
    var F = q.from || "";
    var TO = q.to || "";
    var S = (q.search || "").toLowerCase();

    var rows = _loadAll().filter(function (e) {
      if (A && !(e.athlete || "").toLowerCase().includes(A)) return false;
      if (C && !(e.coach   || "").toLowerCase().includes(C)) return false;
      if (P && e.program !== P) return false;
      if (D && e.discipline !== D) return false;
      if (T && e.type !== T) return false;
      if (F && (e.date || "") < F) return false;
      if (TO && (e.date || "") > TO) return false;
      if (S) {
        var hay = (e.note || "") + " " + safeJSON(e.meta);
        if (!hay.toLowerCase().includes(S)) return false;
      }
      return true;
    });

    switch (q.sort || "date_desc") {
      case "date_asc": rows.sort(byAsc("date", "ts")); break;
      case "ts_asc": rows.sort(byAsc("ts")); break;
      case "ts_desc": rows.sort(byDesc("ts")); break;
      default: rows.sort(byDesc("date", "ts"));
    }

    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / size));
    var begin = (page - 1) * size;
    var slice = rows.slice(begin, begin + size);

    return { rows: slice, total: total, page: page, pageSize: size, pages: pages };
  }

  /** Fast count by simple filters (for KPIs). */
  function count(q) {
    return list(Object.assign({}, q, { page: 1, pageSize: 1e9, sort: "ts_desc" })).total;
  }

  /** Danger: wipes ALL local live data. */
  function wipeLocal() { localStorage.removeItem(KEY); }

  // ---- Private helpers ------------------------------------------------------

  function _loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
  }
  function _persist(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
  function _replaceAll(list) { _persist(Array.isArray(list) ? list : []); }

  function uid() {
    // simple, URL-safe, no-crypto uid
    return "L" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function isoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function num(v, def) {
    var n = +v; return isFinite(n) ? n : (def == null ? null : def);
  }
  function safeJSON(o) {
    try { return JSON.stringify(o || {}); } catch(e){ return ""; }
  }
  function byDesc(primary, secondary) {
    return function(a,b){
      var x = cmp(b[primary], a[primary]);
      return x || (secondary ? cmp(b[secondary], a[secondary]) : 0);
    };
  }
  function byAsc(primary, secondary) {
    return function(a,b){
      var x = cmp(a[primary], b[primary]);
      return x || (secondary ? cmp(a[secondary], b[secondary]) : 0);
    };
  }
  function cmp(a,b){
    if (a==null && b==null) return 0;
    if (a==null) return -1;
    if (b==null) return 1;
    if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
    return (a<b)?-1:(a>b)?1:0;
  }

})(window);
