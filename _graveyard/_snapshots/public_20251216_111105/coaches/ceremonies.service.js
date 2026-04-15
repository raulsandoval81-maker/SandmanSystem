/* /public/coaches/ceremonies.service.js
   Sandman System™ — Ceremonies service (LOCAL STUB)
   - No Firebase calls.
   - Persists to localStorage so you can sweep clean now.
   - Swap internals to Firestore later without touching page HTML.

   Attach API to window.CoachCeremonies to avoid module imports.
*/
(function (global) {
  const STORE_KEY = "sandman_ceremonies_log_v1";
  const FEATURE_FLAGS = { allowLocalWrite: true };

  // ---- helpers ------------------------------------------------------------
  const nowISO = () => new Date().toISOString();

  function loadLog() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function saveLog(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function uid() {
    return "cer_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  // ---- public API ---------------------------------------------------------
  const svc = {
    /** One-time bootstrap (no Firebase yet). Keep signature for parity. */
    async bootstrap(options = {}) {
      // placeholder for future: init Firebase app / auth / firestore here
      return { ok: true, flags: FEATURE_FLAGS, options };
    },

    /** Static badge catalog (extend later or load from config) */
    getBadgeOptions(track = "foundry8") {
      if (track === "foundry4") {
        return ["apprentice","warrior","champion","veteran","legend"];
      }
      // default: Foundry 8 (youth)
      return ["shadow","recruit","combatant","competitor","warrior","champion","commander","sandman","hero"];
    },

    /** Simple name search stub (replace with Firestore query later) */
    async findAthletesByQuery(q = "") {
      // Local demo: return empty list; wiring later will hit Firestore.
      // Keep shape stable for the UI.
      return [];
    },

    /** Placeholder XP check. Replace with real tier % read later. */
    async isEligibleForPromotion(/* athleteId, badge */) {
      return true; // always true in stub
    },

    /** Log promotion (localStorage); returns created record */
    async logPromotion({ athleteName, badge, promotedBy = "Coach", notes = "" }) {
      if (!FEATURE_FLAGS.allowLocalWrite) return { ok:false, error:"Writes disabled" };
      if (!athleteName || !badge) return { ok:false, error:"Missing athlete or badge" };

      const rec = {
        id: uid(),
        athleteName,
        badge,
        promotedBy,
        notes,
        createdAt: nowISO(),
        source: "local-stub" // marker so you don’t mistake it for real data
      };
      const log = loadLog();
      log.unshift(rec);
      saveLog(log);
      return { ok: true, record: rec };
    },

    /** Read recent ceremony records (local) */
    async listRecent(limit = 25) {
      const log = loadLog();
      return log.slice(0, limit);
    },

    /** Wipe local demo data (handy during sweep) */
    async clearLocal() {
      saveLog([]);
      return { ok: true };
    }
  };

  global.CoachCeremonies = svc;
})(window);
