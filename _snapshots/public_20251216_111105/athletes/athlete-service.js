/* global window, AthleteValidators */
(function () {
  const USE_FIREBASE = false; // flip to true when wiring Firestore

  // ---------- Local storage backend ----------
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }
  function lsSet(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr || []));
  }
  function genId(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
  }
  function upsert(list, item, idField = "id") {
    const id = item[idField] || (item[idField] = genId("rec"));
    const i = list.findIndex(x => x[idField] === id);
    if (i >= 0) list[i] = item; else list.unshift(item);
    return id;
  }

  // ---------- Firestore placeholders (no-ops for now) ----------
  async function fsUpsert(/* collection, item */) {
    throw new Error("Firestore not enabled");
  }
  async function fsList(/* collection, filters, paging */) {
    throw new Error("Firestore not enabled");
  }
  async function fsRemove(/* collection, id */) {
    throw new Error("Firestore not enabled");
  }

  // ---------- Public API ----------
  const Service = {
    USE_FIREBASE,
    genId,

    // Generic local helpers you can reuse in feature services:
    lsGet, lsSet, upsert,

    // Normalized label helpers
    programLabel(code) {
      return code === "foundry8" ? "Foundry 8"
        : code === "foundry4" ? "Foundry 4"
        : code === "leadership" ? "Leadership"
        : code || "—";
    },

    // Firestore stubs
    fsUpsert, fsList, fsRemove
  };

  window.AthleteService = Service;
})();
