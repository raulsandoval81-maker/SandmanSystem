// Shared Content Layer (single source of truth)
// Works now with localStorage. Flip the FIRESTORE switches later.

export const Content = {
  /* ---------------------- Storage backend switch ---------------------- */
  // set to 'mock' now; change to 'firestore' after deploy.
  backend: 'mock',

  /* ---------------------------- Collections --------------------------- */
  // Unified paths (Firestone-ready). Keep these names consistent.
  paths: {
    weekly:      'weekly',         // coach-authored weekly entries
    motivation:  'motivation',     // videos, podcasts, quotes
    recognition: 'recognition',    // badges / honors
    logs:        'logs',           // athlete live logs (FEPR)
    calendar:    'calendar',       // events
    media:       'media'           // optional uploads
  },

  /* ----------------------------- MOTIVATION --------------------------- */
  async listMotivation({tags=[], q='' } = {}) {
    const rows = await getAll('motivation');
    return rows
      .filter(r => !tags.length || tags.some(t => (r.tags||[]).includes(t)))
      .filter(r => !q || (r.title||'').toLowerCase().includes(q.toLowerCase())
                       || (r.desc||'').toLowerCase().includes(q.toLowerCase()))
      .sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0) || (b.ts - a.ts));
  },

  /* ------------------------------- WEEKLY ----------------------------- */
  // Coach lens: full list, newest first
  async listWeeklyAll() {
    const rows = await getAll('weekly');
    return rows.sort((a,b)=>b.ts - a.ts);
  },
  // Parent lens: recent summary only
  async listWeeklyRecent({limit=4} = {}) {
    const rows = await Content.listWeeklyAll();
    return rows.slice(0, limit);
  },
  // Athlete lens: same as parent (surface recent)
  async listWeeklyForAthlete({limit=4} = {}) {
    const rows = await Content.listWeeklyAll();
    return rows.slice(0, limit);
  },
  async saveWeekly(entry) {
    // entry: {week, theme, drills, focus, notes}
    const row = { ...entry, ts: Date.now() };
    await pushOne('weekly', row);
    return row;
  },
  async deleteWeekly(indexNewestFirst) {
    const rows = await Content.listWeeklyAll();
    rows.splice(indexNewestFirst, 1);
    await setAll('weekly', rows);
  },

  /* ------------------------------- LOGS ------------------------------- */
  // Athlete FEPR logs (coach or athlete authored). Scope later by athleteId.
  async listLogs({athleteId=null, limit=50}={}) {
    const rows = await getAll('logs');
    const filtered = athleteId ? rows.filter(r=>r.athleteId===athleteId) : rows;
    return filtered.sort((a,b)=>b.ts - a.ts).slice(0, limit);
  },
  async addLog({athleteId, title, note, focus, effort, perspective, respect, skills=[]}) {
    const row = { athleteId, title, note, focus, effort, perspective, respect, skills, ts: Date.now() };
    await pushOne('logs', row);
    return row;
  },

  /* ----------------------------- RECOGNITION -------------------------- */
  async listRecognition({athleteId=null, limit=20}={}) {
    const rows = await getAll('recognition');
    const filtered = athleteId ? rows.filter(r=>r.athleteId===athleteId) : rows;
    return filtered.sort((a,b)=>b.ts - a.ts).slice(0, limit);
  },

  /* ------------------------------ CALENDAR ---------------------------- */
  async listCalendar({from=null, to=null}={}) {
    const rows = await getAll('calendar');
    return rows
      .filter(r => !from || new Date(r.start)>=new Date(from))
      .filter(r => !to   || new Date(r.start)<=new Date(to))
      .sort((a,b)=> new Date(a.start) - new Date(b.start));
  }
};

/* ========================== MOCK IMPLEMENTATION ========================== */
const KEY_PREFIX = 'sandman.shared.';
async function getAll(col){ return JSON.parse(localStorage.getItem(KEY_PREFIX+col) || '[]'); }
async function setAll(col, rows){ localStorage.setItem(KEY_PREFIX+col, JSON.stringify(rows)); }
async function pushOne(col, row){ const rows = await getAll(col); rows.push(row); await setAll(col, rows); }

/* ========================== FIRESTORE (commented) =========================
import { db, collection, getDocs, addDoc, query, orderBy, where } from './firebase-init.js';

async function getAllFS(colName){
  const snap = await getDocs(collection(db, colName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function pushOneFS(colName, row){ await addDoc(collection(db, colName), row); }

Then flip:
- replace getAll → getAllFS
- replace pushOne → pushOneFS
- replace setAll with batched writes or per-doc updates
and set: Content.backend = 'firestore'
============================================================================ */
