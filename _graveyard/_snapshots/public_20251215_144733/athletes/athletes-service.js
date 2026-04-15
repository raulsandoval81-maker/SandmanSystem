/* =============================================================================
  AthletesService (plural, no modules) — /public/athletes/AthletesService.js
  Purpose: Manage *collections* of athletes: registry, queries, bulk ops,
           leaderboards, and import/export. Uses AthleteService for per-athlete.
  Storage: localStorage "athletes:registry" = ['id-a','id-b',...]
  Exposed: window.AthletesService
============================================================================= */

(function (global) {
  "use strict";

  var REG_KEY = "athletes:registry"; // array of normalized ids

  // ---------- Public API -----------------------------------------------------
  var api = {
    // registry
    register, unregister, isRegistered, allIds, count,

    // create/update via AthleteService and ensure registry membership
    upsertProfile, getProfile, removeProfile,

    // queries
    listProfiles, search, filter, paginate,

    // bulk ops
    bulkXP, bulkPatch, bulkProgramMove,

    // leaderboard
    leaderboard, // compute ranking with simple presets or custom scorer

    // import/export
    exportJSON, exportCSV, importJSON,

    // seed + utils
    seedDemo, wipeRegistryOnly
  };

  global.AthletesService = api;

  // ---------- Registry -------------------------------------------------------
  function _loadReg() {
    try { return JSON.parse(localStorage.getItem(REG_KEY) || "[]"); }
    catch(e){ return []; }
  }
  function _saveReg(ids) { localStorage.setItem(REG_KEY, JSON.stringify(ids)); }

  function register(id) {
    var pid = AthleteService.normId(id);
    var ids = _loadReg();
    if (!ids.includes(pid)) { ids.push(pid); _saveReg(ids); }
    return pid;
  }
  function unregister(id) {
    var pid = AthleteService.normId(id);
    var ids = _loadReg().filter(function(x){ return x !== pid; });
    _saveReg(ids);
    return pid;
  }
  function isRegistered(id) { return _loadReg().includes(AthleteService.normId(id)); }
  function allIds() { return _loadReg().slice(); }
  function count() { return _loadReg().length; }

  // ---------- Profiles -------------------------------------------------------
  function upsertProfile(profile) {
    var saved = AthleteService.saveProfile(profile);
    register(saved.id);
    return saved;
  }
  function getProfile(id) {
    return AthleteService.getProfile(id);
  }
  function removeProfile(id) {
    unregister(id);
    AthleteService.deleteProfile(id);
  }

  // ---------- Queries --------------------------------------------------------
  /**
   * listProfiles({program, division, active, ids})
   * Returns array of profiles matching simple filters.
   */
  function listProfiles(q) {
    q = q || {};
    var ids = q.ids && q.ids.length ? q.ids.map(AthleteService.normId) : allIds();
    var out = [];
    for (var i=0; i<ids.length; i++) {
      var p = AthleteService.getProfile(ids[i]);
      if (!p) continue;
      if (q.program && p.program !== q.program) continue;
      if (q.division && p.division !== q.division) continue;
      if (typeof q.active === "boolean" && !!p.active !== q.active) continue;
      out.push(p);
    }
    return out;
  }

  /**
   * search(text, opts) — case-insensitive contains() against name/id/meta JSON.
   */
  function search(text, opts) {
    var hay = String(text || "").trim().toLowerCase();
    if (!hay) return listProfiles(opts || {});
    var rows = listProfiles(opts || {});
    return rows.filter(function(p){
      var blob = (p.name + " " + p.id + " " + safeJSON(p.meta)).toLowerCase();
      return blob.includes(hay);
    });
  }

  /**
   * filter(profiles, fn) — helper to chain custom predicates.
   */
  function filter(profiles, predicate) {
    return (profiles || []).filter(predicate || function(){return true;});
  }

  /**
   * paginate(list, {page=1,pageSize=25})
   */
  function paginate(list, opts) {
    opts = opts || {};
    var page = Math.max(1, +opts.page || 1);
    var size = Math.max(1, +opts.pageSize || 25);
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / size));
    var start = (page-1)*size;
    return { rows: list.slice(start, start+size), total: total, page: page, pageSize: size, pages: pages };
  }

  // ---------- Bulk Operations -----------------------------------------------
  /**
   * bulkXP({ ids, amount, reason, tag, by, at, meta }) -> { updated, errors }
   */
  function bulkXP(opts) {
    var ids = (opts.ids || allIds()).map(AthleteService.normId);
    var updated = [], errors = [];
    ids.forEach(function(id){
      try {
        AthleteService.addXP({
          id: id, amount: opts.amount, reason: opts.reason,
          tag: opts.tag, by: opts.by, at: opts.at, meta: opts.meta
        });
        updated.push(id);
      } catch(e){ errors.push({ id:id, error:String(e) }); }
    });
    return { updated: updated, errors: errors };
  }

  /**
   * bulkPatch({ ids, patch })
   */
  function bulkPatch(opts) {
    var ids = (opts.ids || allIds()).map(AthleteService.normId);
    var updated = [], errors = [];
    ids.forEach(function(id){
      try { AthleteService.patchProfile(id, opts.patch || {}); updated.push(id); }
      catch(e){ errors.push({ id:id, error:String(e) }); }
    });
    return { updated: updated, errors: errors };
  }

  /**
   * bulkProgramMove({ from, to }) — move all profiles program label.
   */
  function bulkProgramMove(cfg) {
    var rows = listProfiles({ program: cfg.from });
    return bulkPatch({ ids: rows.map(function(p){return p.id;}), patch: { program: cfg.to } });
  }

  // ---------- Leaderboard ----------------------------------------------------
  /**
   * leaderboard({ program, division, discipline, range, preset, limit, mapRow })
   *  - preset: 'totalXP' (default), 'recent30', 'tournamentOnly'
   *  - range: {from:'YYYY-MM-DD', to:'YYYY-MM-DD'} (used for recent/tournament)
   *  - limit: top N (default 50)
   *  - mapRow: optional mapper(row) to shape output
   * Returns: [{ id, name, total, rank, profile, extra... }]
   */
  function leaderboard(opts) {
    opts = opts || {};
    var rows = listProfiles({
      program: opts.program,
      division: opts.division,
      active: true
    });

    // compute score
    var scored = rows.map(function(p){
      var score = 0, extra = {};
      var range = opts.range || {};

      switch (opts.preset || "totalXP") {
        case "tournamentOnly":
          var ledT = AthleteService.listXPLedger(p.id, {
            from: range.from, to: range.to, page: 1, pageSize: 10000
          }).rows;
          score = ledT
            .filter(function(r){ return r.reason === "tournament-show" || r.reason === "tournament-win"; })
            .reduce(function(s,r){ return s + (+r.amount||0); }, 0);
          extra.entries = ledT.length;
          break;

        case "recent30":
          var ledR = AthleteService.listXPLedger(p.id, {
            from: dateMinusDays(30), to: todayISO(), page: 1, pageSize: 10000
          }).rows;
          score = ledR.reduce(function(s,r){ return s + (+r.amount||0); }, 0);
          extra.entries = ledR.length;
          break;

        default: // totalXP
          score = AthleteService.getXPTotal(p.id);
      }

      return { id: p.id, name: p.name, total: score, profile: p, extra: extra };
    });

    // sort desc by total, break ties by name
    scored.sort(function(a,b){ return (b.total - a.total) || a.name.localeCompare(b.name); });

    // rank
    var out = [];
    var prev = null, rank = 0, seen = 0;
    for (var i=0; i<scored.length; i++) {
      var row = scored[i]; seen++;
      if (prev === null || row.total < prev) { rank = seen; prev = row.total; }
      var shaped = opts.mapRow ? opts.mapRow(Object.assign({rank:rank}, row)) : Object.assign({rank:rank}, row);
      out.push(shaped);
    }

    return out.slice(0, Math.max(1, +opts.limit || 50));
  }

  // ---------- Import / Export -----------------------------------------------
  function exportJSON() {
    var ids = allIds();
    var bundle = ids.map(function(id){
      return {
        profile: AthleteService.getProfile(id),
        xpTotal: AthleteService.getXPTotal(id),
        xpLedger: AthleteService.listXPLedger(id, { page:1, pageSize: 100000 }).rows,
        badges: AthleteService.listBadges(id)
      };
    });
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), athletes: bundle }, null, 2);
  }

  function exportCSV() {
    var ids = allIds();
    var lines = ["id,name,program,division,active,xpTotal"];
    ids.forEach(function(id){
      var p = AthleteService.getProfile(id) || {};
      var row = [
        escCSV(p.id), escCSV(p.name), escCSV(p.program),
        escCSV(p.division || ""), p.active ? "1" : "0",
        AthleteService.getXPTotal(id)
      ].join(",");
      lines.push(row);
    });
    return lines.join("\n");
  }

  /**
   * importJSON(json, { merge=false })
   * - If merge=false, registry is replaced with incoming IDs.
   */
  function importJSON(json, cfg) {
    var data = {};
    try { data = JSON.parse(json || "{}"); } catch(e){ throw new Error("Invalid JSON"); }
    if (!data || !Array.isArray(data.athletes)) throw new Error("Missing athletes[] payload");

    if (!(cfg && cfg.merge)) { _saveReg([]); }

    data.athletes.forEach(function(item){
      if (!item || !item.profile) return;
      var saved = AthleteService.saveProfile(item.profile);
      register(saved.id);

      // restore xp
      AthleteService.wipeXPLocal(saved.id);
      (item.xpLedger || []).slice().reverse().forEach(function(r){
        AthleteService.addXP(Object.assign({ id: saved.id }, r));
      });
      // sanity overwrite total if provided
      if (typeof item.xpTotal === "number") AthleteService.setXPTotal(saved.id, item.xpTotal);

      // restore badges
      (item.badges || []).slice().reverse().forEach(function(b){
        AthleteService.awardBadge(Object.assign({ id: saved.id }, b));
      });
    });

    return count();
  }

  // ---------- Seed + Utils ---------------------------------------------------
  function seedDemo() {
    var demo = [
      { id: "reyes", name: "Michael Reyes", program: "foundry4", division: "varsity" },
      { id: "sandoval", name: "Raul Sandoval", program: "foundry4", division: "varsity" },
      { id: "anna", name: "Anna Sandoval", program: "foundry8", division: "youth-12u" }
    ];
    demo.forEach(function(p){
      upsertProfile(p);
      AthleteService.addXP({ id: p.id, amount: 120, reason: "attendance", tag: p.program.toUpperCase() });
      AthleteService.addXP({ id: p.id, amount: 50, reason: "merit" });
    });
    return count();
  }

  function wipeRegistryOnly() { _saveReg([]); }

  // helpers
  function todayISO() { return dateToISO(new Date()); }
  function dateMinusDays(n) {
    var d = new Date(); d.setDate(d.getDate()-Math.max(0, +n||0)); return dateToISO(d);
  }
  function dateToISO(d) {
    var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), da=String(d.getDate()).padStart(2,"0");
    return y+"-"+m+"-"+da;
  }
  function safeJSON(o){ try{ return JSON.stringify(o||{}); }catch(e){ return ""; } }
  function escCSV(v){ return ('"'+String(v==null?"":v).replace(/"/g,'""')+'"'); }

})(window);
