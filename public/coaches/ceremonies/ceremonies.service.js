/* /public/coaches/ceremonies/ceremonies.service.js
   Sandman System™ — Ceremonies service (LOCAL STUB)
   Purpose:
   - Ceremony/Belt recognition only
   - No promotion logic
   - Local storage now, Firestore later
*/
(function (global) {
  const STORE_KEY = "sandman_ceremonies_log_v2";
  const FEATURE_FLAGS = { allowLocalWrite: true };

  const nowISO = () => new Date().toISOString();

  function loadLog() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveLog(arr) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function makeId() {
    return "cer_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  const svc = {
    async bootstrap(options = {}) {
      return { ok: true, flags: FEATURE_FLAGS, options };
    },

    async logCeremonyAward({
      uid = "",
      athleteName = "",
      track = "",
      tier = "",
      rankName = "",
      beltAwarded = true,
      ceremonyDate = "",
      awardedBy = "Coach",
      notes = "",
    }) {
      if (!FEATURE_FLAGS.allowLocalWrite) {
        return { ok: false, error: "Writes disabled" };
      }

      if (!uid || !athleteName || !rankName) {
        return { ok: false, error: "Missing required ceremony fields" };
      }

      const rec = {
        id: makeId(),
        uid,
        athleteName,
        track,
        tier,
        rankName,
        beltAwarded,
        ceremonyDate: ceremonyDate || nowISO(),
        awardedBy,
        notes,
        createdAt: nowISO(),
        source: "local-stub",
        type: "BELT_AWARD",
      };

      const log = loadLog();
      log.unshift(rec);
      saveLog(log);

      return { ok: true, record: rec };
    },

    async listRecent(limit = 25) {
      return loadLog().slice(0, limit);
    },

    async clearLocal() {
      saveLog([]);
      return { ok: true };
    }
  };

  global.CoachCeremonies = svc;
})(window);