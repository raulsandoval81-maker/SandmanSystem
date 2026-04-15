;(() => {
  const SM = window.Sandman;
  const { DB, CoachSettings } = SM;

  function hmToMinutes(hm){ const [h,m]=hm.split(':').map(Number); return h*60+m; }
  function inOfficeHours(now=new Date()){
    const mins = now.getHours()*60 + now.getMinutes();
    const day  = now.getDay();
    if (!CoachSettings.officeHours.days.includes(day)) return false;
    return mins >= hmToMinutes(CoachSettings.officeHours.start) &&
           mins <= hmToMinutes(CoachSettings.officeHours.end);
  }
// comms-service.js
console.log("[OK] comms-service.js loaded");
  SM.Comms = {
    async openThread({ topic, priority='normal', from, to=[], aboutUid=null }) {
      const participants = Array.from(new Set([from, ...to]));
      const th = {
        topic, priority, participants, status:'open',
        slaHint: inOfficeHours() ? 'reply during current window' : 'auto: next office hours',
        createdBy: from, createdAt: Date.now(), lastMessageAt: Date.now(), aboutUid
      };
      return DB.add('messages_threads', th);
    },
    async postMessage({ threadId, text, by }) {
      const msg = await DB.add('messages_items', { threadId, text, by, ts: Date.now() });
      await DB.set('messages_threads', threadId, { lastMessageAt: msg.ts });
      if (!inOfficeHours()){
        await DB.add('messages_items', { threadId, text:'Auto: Thanks for reaching out — we’ll reply during office hours.', by:'system', ts: Date.now() });
      }
      return msg;
    }
  };

  // expose helpers if needed elsewhere
  SM.Comms.inOfficeHours = inOfficeHours;
})();
// comms-service.js
