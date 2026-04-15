;(() => {
  // Global namespace (one place)
  window.Sandman = window.Sandman || {};
  const SM = window.Sandman;

  // Minimal DB shim placeholder; swap with Firestore adapter later.
  SM.DB = SM.DB || {
    add: async (col, obj) => ({ id: crypto.randomUUID?.() || String(Math.random()).slice(2), ...obj }),
    set: async (col, id, obj) => ({ id, ...obj }),
    get: async (col, id) => null,
    query: async (_q) => [],
  };

  // Common helpers
  SM.Audience = {
    coachOnly:   () => ({ coach: true, parent: false, athlete: false }),
    coachAth:    () => ({ coach: true, parent: false, athlete: true  }),
    allThree:    () => ({ coach: true, parent: true,  athlete: true  }),
    parentAth:   () => ({ coach: false,parent: true,  athlete: true  }),
  };

  SM.Time = {
    utcIsoDate: (d=new Date()) => d.toISOString().slice(0,10),
    monthKey:   (ms) => { const x=new Date(ms); return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`; },
  };

  // Coach settings placeholder (used by comms)
  SM.CoachSettings = SM.CoachSettings || {
    officeHours: { start: '12:00', end: '14:00', days:[1,2,3,4,5] },
    meetMode: false,
    staffOnDuty: ['coach_mgr'],
  };
})();
console.log("[OK] service.js loaded");
