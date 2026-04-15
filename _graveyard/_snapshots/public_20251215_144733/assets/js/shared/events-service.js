;(() => {
  const { DB, Audience, Time } = window.Sandman;
  const SM = window.Sandman;

  SM.Events = {
    async createDaily({ title, body, date = Time.utcIsoDate(), audience = Audience.allThree(), athletes = null, createdBy='coach' }) {
      return DB.add('events', { scope:'daily', title, body, dates:{date}, audience, athletes, createdBy, createdAt: Date.now() });
    },
    async createWeekly({ title, body, start, end, audience = Audience.allThree(), createdBy='coach' }) {
      return DB.add('events', { scope:'weekly', title, body, dates:{start,end}, audience, athletes:null, createdBy, createdAt: Date.now() });
    },
    async createTournament({ title, body, when, where, athletes=[], audience = Audience.allThree(), createdBy='coach' }) {
      return DB.add('events', { scope:'tournament', title, body, dates:{when,where}, audience, athletes, createdBy, createdAt: Date.now() });
    },
  };
})();
console.log("[OK] events-service.js loaded");
