/* =========================================================
   Sandman — schema.ts (MVP+)
   One source of truth for data shapes + helper functions
   ========================================================= */

/* ---------- Core ID aliases ---------- */
export type UID = string;   // Athlete ID (e.g., F8-2509-001A)
export type PID = string;   // Parent ID
export type CID = string;   // Coach ID
export type TID = string;   // Team/club ID
export type ID  = string;   // Generic doc id
export type ISODate = string;

/* ---------- Tracks / lanes / tiers ---------- */
export type Track = 'F8' | 'F4';              // Foundry 8 (Youth) | Foundry 4 (Teen/Adult)
export type Lane  = 'combat' | 'strength' | 'honor' | 'leadership'; // lanes

/** Tier within a track — names do not cross-reuse between tracks. */
export interface TierRef {
  track: Track;
  code: string;        // "T0"..."T8" (F8), "T0"..."T4" (F4)
  name: string;        // e.g., "Shadow", "Warrior", "Legend"
  capXp?: number;      // XP cap for the tier (undefined for top/no-cap)
}

/* Youth (F8) tier catalog (names stable, caps adjustable in pilot) */
export const F8_TIERS: TierRef[] = [
  { track: 'F8', code: 'T0', name: 'Shadow',    capXp: 600 },
  { track: 'F8', code: 'T1', name: 'Recruit',   capXp: 800 },
  { track: 'F8', code: 'T2', name: 'Combatant', capXp: 1000 },
  { track: 'F8', code: 'T3', name: 'Competitor',capXp: 1200 },
  { track: 'F8', code: 'T4', name: 'Warrior',   capXp: 1400 },
  { track: 'F8', code: 'T5', name: 'Champion',  capXp: 1600 },
  { track: 'F8', code: 'T6', name: 'Commander', capXp: 1800 },
  { track: 'F8', code: 'T7', name: 'Sandman'  , capXp: 2000 },
  { track: 'F8', code: 'T8', name: 'Hero',       capXp:2400 }, // no stripes
];

/* Teen/Adult (F4) */
export const F4_TIERS: TierRef[] = [
  { track: 'F4', code: 'T0', name: 'Apprentice', capXp: 800  },
  { track: 'F4', code: 'T1', name: 'Warrior',    capXp: 1400 },
  { track: 'F4', code: 'T2', name: 'Champion',   capXp: 1600 },
  { track: 'F4', code: 'T3', name: 'Veteran',    capXp: 2000 },
  { track: 'F4', code: 'T4', name: 'Legend',     capXp: 2400  }, // no stripes
];

/* ---------- Audience / scope ---------- */
export interface Audience { coach: boolean; parent: boolean; athlete: boolean; }
export type Scope = 'daily' | 'weekly' | 'monthly' | 'tournament';

/* ---------- Athlete / Parent / Coach ---------- */
export interface Athlete {
  uid: UID;
  track: Track;              // F8 | F4
  padlock_id: string;        // internal disambiguator (e.g., "0001")
  publicName?: string;       // e.g., "R. Sandoval"
  privateFirst?: string;     // private roster fields
  privateLast?: string;
  tier: string;              // "T0"..."T8" / "T0"..."T4" (enforce with track elsewhere)
  xp_total: number;          // sum of all lanes
  xp_by_lane: Partial<Record<Lane, number>>; // guardrail: per-lane, not one pot
  comp_gate: number;         // baseline (e.g., 800)
  status: 'pending' | 'active' | 'inactive' | 'suspended';
  stripe_count?: number;
  flags?: {
    veteran?: boolean;       // F4 rule: 2 yrs + proof before multi-lane
    fastTrack?: boolean;     // F4 only
    eligibility_hold?: boolean;
  };
  created_at?: number;
  updated_at?: number;
  teamId?: TID;
  parentIds?: PID[];
  coachIds?: CID[];
}

export interface ParentProfile {
  pid: PID;
  name?: string;
  email?: string;
  phone?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  linkedAthletes: UID[];
  createdAt?: number;
  updatedAt?: number;
  notifications?: {
    dailySummary?: boolean;   // default false
    weeklyTheme?: boolean;    // default true
    tournament?: boolean;     // default true
  };
}

export interface CoachProfile {
  cid: CID;
  name?: string;
  role?: 'head' | 'assistant' | 'staff';
  teamId?: TID;
  createdAt?: number;
  updatedAt?: number;
}

export interface CoachSettings {
  cid: CID;
  parentShareDefaults?: {
    dailySummary: boolean;     // default OFF
    weeklyTheme: boolean;      // default ON
    tournamentRecap: boolean;  // default ON
  };
  officeHours?: { days: number[]; start: string; end: string; timezone?: string; };
  meetMode?: { enabled: boolean; routeUrgentToStaff?: boolean; };
  rateLimits?: { parentNewThreadsPerDay: number };
}

/* ---------- Intake ---------- */
export interface Intake {
  id: ID;                     // token id
  snapshot: any;              // raw submitted form
  uid?: UID;                  // minted on submit (if coach didn’t pre-assign)
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
  submittedBy?: PID | CID;
  reviewedBy?: CID;
  notes?: string;
}

/* ---------- Events (calendar-like) ---------- */
export interface EventItem {
  id: ID;
  scope: Scope;               // daily | weekly | monthly | tournament
  lane_id?: Lane;             // optional: focus lane for this event
  title: string;
  body?: string;
  tags?: string[];            // "fundraiser", "travel", etc.
  audience: Audience;         // decides who sees it
  athletes?: UID[] | null;    // null = team-wide
  date?: string;              // ISO date OR start date
  date_end?: string;          // for ranges (weekly, tournament)
  created_by: CID;
  created_at: number;
  updated_at: number;
}

/* ---------- Logs (timeline stream) ---------- */
export type LogKind =
  | 'attendance'
  | 'practice_note'
  | 'tournament_note'
  | 'character'
  | 'strength'
  | 'weight'
  | 'leadership'
  | 'honor_task'     // Sandman Way items / reflections
  | 'ai_feedback'
  | 'audit';

export interface LogItem {
  id: ID;
  kind: LogKind;
  scope?: Scope;              // usually daily or weekly
  lane_id?: Lane;             // CRITICAL GUARDRAIL (slice by lane later)
  athlete_uid?: UID;          // null for team-wide notes
  team_id?: TID | null;
  text?: string;
  payload?: any;              // structured (e.g., {deltaXp, cues:[]})
  audience: Audience;         // who can read
  ts: number;                 // timestamp
  visibilityUntil?: number;   // for ephemeral grants (e.g., emergency 12h)
  created_by: string;         // cid/pid/uid (actor)
}

/* ---------- Skillsheets ---------- */
export interface Skill {
  id: ID;
  label: string;              // e.g., "Single to Finish"
  tag?: string;               // grouping
  lane?: Lane;                // optional: lane affinity
  notes?: string;
}

export interface SkillProgress {
  skillId: ID;
  status: 'new' | 'learning' | 'repping' | 'checked';
  lastCoachNote?: string;
  lastAthNote?: string;
  lastTouchedAt?: number;
}

export interface SkillSheet {
  uid: UID;                   // athlete
  assigned: ID[];             // current focus queue
  progress: SkillProgress[];
  logRefs?: ID[];             // LogItem ids touching this skill
  updatedAt?: number;
}

/* ---------- Strength programs ---------- */
export interface StrengthProgram {
  id: ID;
  title: string;
  durationWeeks: number;      // e.g., 6
  sessionsPerWeek: number;    // e.g., 3
  progression?: { mode: 'percent' | 'rpe' | 'linear' | 'rep-target'; details?: any; };
  movements: string[];        // e.g., ["Back squat", "Press", "Pull"]
  assignedTo: UID[];          // athletes
  audience: Audience;         // usually coach+athlete
  createdBy: CID;
  createdAt: number;
}

export interface StrengthSessionResult {
  movement: string;
  sets: number;
  reps: number;
  load?: number;              // lbs/kg if percent isn’t used
  rpe?: number;
  completed: boolean;
  note?: string;
}

export interface StrengthSession {
  id: ID;
  programId: ID;
  uid: UID;
  week: number;
  dayIndex: number;           // 0..6
  results: StrengthSessionResult[];
  completedAt?: number;
  logRef?: ID;                // LogItem id
}

/* ---------- Mindset (legacy) / Weight ---------- */
export interface MindsetEntry {
  id: ID; uid: UID; promptId?: string; text: string; ts: number;
  audience: Audience;         // AFNI-private: {coach:true, athlete:true, parent:false}
}

export interface WeightEntry {
  id: ID; uid: UID; date: string; weight: number; hydrationOz?: number; notes?: string; ts: number;
}

/* ---------- Messaging (Q&A threads) ---------- */
export type MessageTopic = 'about_athlete' | 'logistics' | 'billing' | 'other';
export type MessagePriority = 'normal' | 'urgent';
export type ThreadStatus = 'open' | 'pending' | 'closed';

export interface Message {
  id: ID; threadId: ID; from: CID | PID | UID; body: string; ts: number; meta?: any;
}
export interface MessageThread {
  id: ID;
  topic: MessageTopic;
  priority: MessagePriority;
  participants: Array<CID | PID | UID>;
  status: ThreadStatus;
  lastMessageAt: number;
  createdAt: number;
  createdBy: CID | PID | UID;
  auto?: { outsideOfficeHours?: boolean; meetModeReroute?: boolean };
}

/* ---------- Permissions (emergency, ephemeral) ---------- */
export interface PermissionGrant {
  id: ID;
  kind: 'emergency_contact_view';
  uid: UID;                   // athlete whose card is viewable
  grantedTo: CID[];           // coach/staff allowed
  reason: 'attendance_marked' | 'manual';
  expiresAt: number;          // e.g., now + 12h
  createdBy: CID;
}

/* ---------- Audit (immutable) ---------- */
export interface AuditEvent {
  id: ID;
  actor: CID | PID | UID;
  type: string;               // e.g., "approve_activate", "intake_submit", "xp_inc"
  target?: { kind: string; id: ID | UID | PID | CID };
  meta?: any;
  ts: number;
}

/* ---------- Utility: defaults ---------- */
export const AUDIENCE = {
  coachOnly: (): Audience => ({ coach: true, parent: false, athlete: false }),
  coachAth:  (): Audience => ({ coach: true, parent: false, athlete: true  }),
  allThree:  (): Audience => ({ coach: true, parent: true,  athlete: true  }),
  parentAth: (): Audience => ({ coach: false,parent: true,  athlete: true  }),
};

/* =========================================================
   XP Engine (single gateway) + caps + audit
   ========================================================= */

/* Lanes constant + back-compat (map old 'mindset' -> 'honor') */
export function normalizeLane(l: Lane | 'mindset'): Lane { return l === 'mindset' ? 'honor' : l; }

/* Increment kinds (reason buckets) */
export type IncKind =
  | 'attendance'
  | 'character'         // quick-picks, homework, community
  | 'tournament'
  | 'skill'             // coach-marked micro-tasks
  | 'strength_session'  // logged S&C session
  | 'weight'            // usually 0 XP; still logged
  | 'leadership_task'   // mentorship/service items
  | 'honor_task';       // Sandman Way items

export interface IncPayload {
  athlete_uid: UID;            // which athlete
  lane_id: Lane | 'mindset';   // guardrail: every inc belongs to a lane
  kind: IncKind;
  amount: number;              // +/- XP request
  note?: string;               // optional, "earned share award"
  source_log_id?: string;      // link to originating log/event
  created_by: string;          // which coach/system
  created_at: number;          // epoch ms
}

/* ---- Cap Tally (per month, per kind, per athlete) ---- */
export interface CapTally {
  athlete_uid: UID;
  kind: IncKind;
  month_key: string;           // "YYYY-MM"
  applied_sum: number;         // sum of *applied* XP for that month/kind
  updated_at: number;
}

/* Minimal in-memory fallback (OK for emulator/demo) */
const _capTallyMem = new Map<string, number>(); // key = uid|kind|YYYY-MM
const mkKey = (uid: string, kind: IncKind, mk: string) => `${uid}|${kind}|${mk}`;
async function dbGetTally(uid: string, kind: IncKind, mk: string): Promise<number> {
  return _capTallyMem.get(mkKey(uid, kind, mk)) ?? 0;
}
async function dbBumpTally(uid: string, kind: IncKind, mk: string, delta: number): Promise<void> {
  const k = mkKey(uid, kind, mk);
  _capTallyMem.set(k, (_capTallyMem.get(k) ?? 0) + delta);
}

/* ---- DB stubs (swap to Firestore later) ---- */
const DB = {
  async getAthlete(uid: UID): Promise<Athlete> {
    // @ts-ignore
    return (window._athDir?.[uid]) || {
      uid, track:'F8', padlock_id:'0001', tier:'T0',
      xp_total: 0, xp_by_lane: {}, comp_gate: 800, status:'pending'
    };
  },
  async saveAthlete(a: Athlete) {
    // @ts-ignore
    window._athDir = window._athDir || {}; window._athDir[a.uid] = a; return a;
  },
  async writeAudit(entry: AuditEvent){ /* TODO Firestore */ return entry; },
};

/* ---- Caps (example pilot defaults) ---- */
export const CAPS = {
  attendance_monthly: 120,     // e.g., +10/day hard cap 12 days
  character_monthly_athlete: 4, // +5 each (20 XP)
  tournament_shows_monthly: 2, // +15 each (30 XP)
  leadership_monthly: 100     // example global cap
};

/* Helper: month key */
const monthKey = (ms: number) => {
  const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
};

/* ---- The gateway ---- */
export async function callInc(p: IncPayload): Promise<{ ok:boolean; applied:number; reason?:string }> {
  const lane = normalizeLane(p.lane_id);
  const mk  = monthKey(p.created_at);

  // 1) enforce caps by kind + month (sample rules; expand later)
  let req = p.amount;
  let cap = Infinity;

  if (p.kind === 'attendance') cap = CAPS.attendance_monthly;
  if (p.kind === 'tournament') cap = CAPS.tournament_shows_monthly * 15; // example: +15/show
  if (p.kind === 'character')  cap = (CAPS.character_monthly_athlete ?? 0) * 5;
  if (p.kind === 'leadership_task' || p.kind === 'honor_task') cap = CAPS.leadership_monthly ?? 100;

  const used = await dbGetTally(p.athlete_uid, p.kind, mk);
  const remaining = Math.max(0, cap - used);
  const applied = Math.max(0, Math.min(remaining, req));

  if (applied === 0) {
    await DB.writeAudit({ id:'', actor:p.created_by, type:'xp_inc_blocked', target:{kind:'athlete', id:p.athlete_uid},
      meta:{ lane, kind:p.kind, requested:req, used, cap, mk }, ts: Date.now() });
    return { ok:false, applied:0, reason:`Cap reached for ${p.kind} in ${mk}` };
  }

  // 2) update athlete.xp_by_lane[lane] only
  const ath = await DB.getAthlete(p.athlete_uid);
  ath.xp_by_lane[lane] = (ath.xp_by_lane[lane] ?? 0) + applied;

  // 3) recompute total
  ath.xp_total =
    (ath.xp_by_lane.combat ?? 0) +
    (ath.xp_by_lane.strength ?? 0) +
    (ath.xp_by_lane.honor ?? 0) +
    (ath.xp_by_lane.leadership ?? 0);

  await DB.saveAthlete(ath);

  // 4) audit + cap tally
  await DB.writeAudit({
    id:'', actor:p.created_by, type:'xp_inc',
    target:{ kind:'athlete', id:p.athlete_uid },
    meta:{ lane, kind:p.kind, requested:req, applied, note:p.note, source_log_id:p.source_log_id, month_key:mk },
    ts: p.created_at
  });
  await dbBumpTally(p.athlete_uid, p.kind, mk, applied);

  return { ok:true, applied };
}

/* =========================================================
   Coaching / Parent / Athlete helpers (UI calls)
   ========================================================= */

/* --- Parent Invite / Intake --- */
export async function makeParentTokenLink(baseUrl: string, track: Track, preUid?: UID){
  const token = crypto.randomUUID();
  // @ts-ignore
  window._intakes = window._intakes || {};
  // @ts-ignore
  window._intakes[token] = { id: token, snapshot:{track, uid: preUid ?? null}, status:'draft', createdAt: Date.now(), updatedAt: Date.now() } as Intake;
  return { token, link: `${baseUrl}?token=${token}` };
}

export async function submitParentIntake(token: string, form: any) {
  // @ts-ignore
  const rec: Intake = (window._intakes||{})[token];
  const track: Track = form.track || rec?.snapshot?.track || 'F8';
  const uid = rec?.uid || mintUid(track);
  const athlete: Athlete = {
    uid, track, padlock_id: form.padlock || '0001',
    publicName: form.publicName, privateFirst: form.first, privateLast: form.last,
    tier: form.tier || 'T0', xp_total: 0, xp_by_lane: {}, comp_gate: 800, status:'pending',
    created_at: Date.now(), updated_at: Date.now(), parentIds: []
  };
  await DB.saveAthlete(athlete);
  // @ts-ignore
  window._intakes[token] = { ...(rec||{}), id:token, uid, snapshot:form, status:'submitted', updatedAt: Date.now() };
  return athlete;
}

export async function approveAndActivate(uid: UID, patch: Partial<Athlete> = {}, actor: CID='coach'){
  const a = await DB.getAthlete(uid);
  Object.assign(a, patch, { status:'active', updated_at: Date.now() });
  await DB.saveAthlete(a);
  await DB.writeAudit({ id:'', actor, type:'approve_activate', target:{kind:'athlete', id:uid}, ts: Date.now() });
  return a;
}

/* --- Events / Logs quick creators (storage-agnostic) --- */
export function makeAudience(o: Partial<Audience> = {}): Audience {
  return { coach:true, parent:false, athlete:true, ...o };
}

export function createEvent(ev: Omit<EventItem,'id'|'created_at'|'updated_at'>): EventItem {
  const e: EventItem = { id: crypto.randomUUID(), created_at: Date.now(), updated_at: Date.now(), ...ev };
  // @ts-ignore
  window._events = window._events || []; window._events.push(e);
  return e;
}
export function createLog(lg: Omit<LogItem,'id'|'ts'>): LogItem {
  const l: LogItem = { id: crypto.randomUUID(), ts: Date.now(), ...lg };
  // @ts-ignore
  window._logs = window._logs || []; window._logs.push(l);
  return l;
}

/* --- Daily / Weekly / Tournament writers --- */
export function saveDaily(args: {title:string; body?:string; date?: string; shareToParents?:boolean; athletes?: UID[]; by?:string;}){
  const ev = createEvent({
    scope:'daily', title: args.title, body: args.body, date: args.date,
    audience: makeAudience({ parent: !!args.shareToParents }),
    athletes: args.athletes ?? null, tags:['daily'], created_by: (args.by as CID)||'coach',
  });
  (args.athletes||[]).forEach(uid => createLog({
    kind:'practice_note', scope:'daily', lane_id: 'combat', athlete_uid: uid,
    text: args.body || args.title, audience: makeAudience({ parent: !!args.shareToParents }),
    created_by: args.by || 'coach'
  }));
  return ev;
}
export const saveWeekly = (args:{title:string; body?:string; start:string; end:string; by?:string; lane_id?:Lane}) =>
  createEvent({ scope:'weekly', title:args.title, body:args.body, date:args.start, date_end:args.end,
    lane_id: args.lane_id, audience: AUDIENCE.allThree(), tags:['weekly'], created_by:(args.by as CID)||'coach' });

export const saveTournament = (args:{title:string; body?:string; when:string; where?:string; athletes?:UID[]; by?:string;}) =>
  createEvent({ scope:'tournament', title:args.title, body:`${args.body||''}${args.where?` • ${args.where}`:''}`,
    date:args.when, audience: AUDIENCE.allThree(), athletes: args.athletes??null, tags:['tournament'], created_by:(args.by as CID)||'coach' });

export function tournamentRecap(items: {uid:UID; recap:string; xpDelta?:number; lane?:Lane;}[], by:CID='coach'){
  items.forEach(({uid, recap, xpDelta=0, lane='combat'}) => {
    createLog({ kind:'tournament_note', scope:'weekly', lane_id: lane, athlete_uid: uid,
      text: recap, payload:{ xpDelta }, audience: AUDIENCE.allThree(), created_by: by });
    if (xpDelta) callInc({ athlete_uid:uid, lane_id:lane, kind:'tournament', amount:xpDelta, created_by:by, created_at:Date.now(), note:'tournament recap' });
  });
}

/* --- Attendance hook (log + emergency grant + XP gateway friendly) --- */
export function markAttendance(uid: UID, fullEffort:boolean=true, by:CID='coach'){
  createLog({
    kind:'attendance', scope:'daily', lane_id:'combat', athlete_uid: uid,
    text: fullEffort ? 'Full effort +10' : 'Half effort +5',
    audience: AUDIENCE.allThree(), created_by: by
  });
  // XP via gateway (lets caps work)
  callInc({
    athlete_uid: uid, lane_id: 'combat', kind:'attendance',
    amount: fullEffort ? 10 : 5, created_by: by, created_at: Date.now(), note: 'practice attendance'
  });
  // Ephemeral emergency card grant (12h)
  createLog({
    kind:'audit', lane_id:'combat', text:'Emergency 12h access granted after attendance.',
    audience: AUDIENCE.coachOnly(), created_by: by
  });
}

/* --- Skillsheet helpers --- */
export function assignSkill(uid: UID, label: string, lane: Lane='combat', tag='technique'){
  // @ts-ignore
  window._skill = window._skill || {};
  // @ts-ignore
  const s: SkillSheet = window._skill[uid] || { uid, assigned:[], progress:[], updatedAt:Date.now() };
  const id = crypto.randomUUID();
  s.assigned.push(id);
  s.progress.push({ skillId: id, status:'new', lastTouchedAt: Date.now() });
  // @ts-ignore
  window._skill[uid] = s;
  createLog({ kind:'practice_note', scope:'daily', lane_id:lane, athlete_uid:uid,
    text:`Assigned: ${label}`, audience: AUDIENCE.coachAth(), created_by:'coach' });
  return id;
}

/* --- Simple meter compute (for athlete page header) --- */
export function computeTierProgress(uid: UID){
  // @ts-ignore
  const a: Athlete = (window._athDir||{})[uid]; if (!a) return { track:'F8', tier:'T0', rank:'-', xp:0, cap:800, pct:0 };
  const track = a.track || 'F8';
  const caps = (track==='F8'?F8_TIERS:F4_TIERS).reduce((m,t)=>{m[t.code]=t.capXp||m[t.code]||800;return m;},{} as Record<string,number>);
  const tier = a.tier || 'T0';
  const cap  = caps[tier] || 800;
  const xp   = a.xp_total|0;
  const pct  = Math.min(100, Math.round((xp/cap)*100));
  const rank = (track==='F8'?F8_TIERS:F4_TIERS).find(t=>t.code===tier)?.name || '-';
  return { track, tier, rank, xp, cap, pct };
}

/* --- Tiny helpers --- */
export function mintUid(track: Track, now=new Date()){
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const seq = Math.floor(Math.random()*9999)+1;
  return `${track}-${yy}${mm}-${String(seq).padStart(4,'0')}`;
}

/* =========================================================
   Optional: Button binder (IDs → functions). Safe to remove
   ========================================================= */
export function bindCoachUI(doc: Document = document){
  const q = (id:string)=> doc.getElementById(id) as HTMLButtonElement|null;

  q('btn-intake-token')?.addEventListener('click', async ()=>{
    // @ts-ignore
    const out = await makeParentTokenLink(location.origin+location.pathname, (doc.getElementById('intake-track') as HTMLSelectElement)?.value as Track || 'F8');
    const el = doc.getElementById('intake-link') as HTMLInputElement|null; if (el) el.value = out.link;
  });

  q('btn-approve-activate')?.addEventListener('click', async ()=>{
    const uid = (doc.getElementById('aa-uid') as HTMLInputElement)?.value?.trim();
    const tier = (doc.getElementById('aa-tier') as HTMLSelectElement)?.value as string || 'T0';
    if (!uid) return alert('UID required');
    await approveAndActivate(uid, { tier }, 'coach');
    alert('Activated & seeded');
  });

  q('btn-daily-save')?.addEventListener('click', ()=>{
    const title = (doc.getElementById('daily-title') as HTMLInputElement)?.value || 'Practice';
    saveDaily({ title, shareToParents:false, athletes:[] });
    alert('Daily saved');
  });

  q('btn-attendance-full')?.addEventListener('click', ()=>{
    const uid = (doc.getElementById('att-uid') as HTMLInputElement)?.value?.trim(); if (!uid) return;
    markAttendance(uid, true);
  });

  q('btn-assign-skill')?.addEventListener('click', ()=>{
    const uid = (doc.getElementById('skill-uid') as HTMLInputElement)?.value?.trim(); if (!uid) return;
    const label = (doc.getElementById('skill-label') as HTMLInputElement)?.value || 'Single → Shelf';
    assignSkill(uid, label, 'combat');
  });
}

/* =========================================================
   What this gives you immediately
   =========================================================
   • One schema file for Parent/Athlete/Coach + lanes (combat/strength/honor/leadership).
   • XP is per-lane; totals recompute automatically.
   • Caps + audit via callInc; in-memory tallies (swap to Firestore later).
   • Drop-in UI helpers for intake, approve/activate, daily/weekly/tournament,
     attendance, skills, and progress meter.
   • A tiny optional binder to wire your existing buttons by ID.
*/
