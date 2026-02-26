"use strict";
/* =========================================================
   Sandman — schema.ts (MVP+)
   One source of truth for data shapes + helper functions
   ========================================================= */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveTournament = exports.saveWeekly = exports.CAPS = exports.AUDIENCE = exports.F4_TIERS = exports.F8_TIERS = void 0;
exports.normalizeLane = normalizeLane;
exports.callInc = callInc;
exports.makeParentTokenLink = makeParentTokenLink;
exports.submitParentIntake = submitParentIntake;
exports.approveAndActivate = approveAndActivate;
exports.makeAudience = makeAudience;
exports.createEvent = createEvent;
exports.createLog = createLog;
exports.saveDaily = saveDaily;
exports.tournamentRecap = tournamentRecap;
exports.markAttendance = markAttendance;
exports.assignSkill = assignSkill;
exports.computeTierProgress = computeTierProgress;
exports.mintUid = mintUid;
exports.bindCoachUI = bindCoachUI;
/* Youth (F8) tier catalog (names stable, caps adjustable in pilot) */
exports.F8_TIERS = [
    { track: 'F8', code: 'T0', name: 'Shadow', capXp: 600 },
    { track: 'F8', code: 'T1', name: 'Recruit', capXp: 800 },
    { track: 'F8', code: 'T2', name: 'Combatant', capXp: 1000 },
    { track: 'F8', code: 'T3', name: 'Competitor', capXp: 1200 },
    { track: 'F8', code: 'T4', name: 'Warrior', capXp: 1400 },
    { track: 'F8', code: 'T5', name: 'Champion', capXp: 1600 },
    { track: 'F8', code: 'T6', name: 'Commander', capXp: 1800 },
    { track: 'F8', code: 'T7', name: 'Sandman', capXp: 2000 },
    { track: 'F8', code: 'T8', name: 'Hero', capXp: 2400 }, // no stripes
];
/* Teen/Adult (F4) */
exports.F4_TIERS = [
    { track: 'F4', code: 'T0', name: 'Apprentice', capXp: 800 },
    { track: 'F4', code: 'T1', name: 'Warrior', capXp: 1400 },
    { track: 'F4', code: 'T2', name: 'Champion', capXp: 1600 },
    { track: 'F4', code: 'T3', name: 'Veteran', capXp: 2000 },
    { track: 'F4', code: 'T4', name: 'Legend', capXp: 2400 }, // no stripes
];
/* ---------- Utility: defaults ---------- */
exports.AUDIENCE = {
    coachOnly: () => ({ coach: true, parent: false, athlete: false }),
    coachAth: () => ({ coach: true, parent: false, athlete: true }),
    allThree: () => ({ coach: true, parent: true, athlete: true }),
    parentAth: () => ({ coach: false, parent: true, athlete: true }),
};
/* =========================================================
   XP Engine (single gateway) + caps + audit
   ========================================================= */
/* Lanes constant + back-compat (map old 'mindset' -> 'honor') */
function normalizeLane(l) { return l === 'mindset' ? 'honor' : l; }
/* Minimal in-memory fallback (OK for emulator/demo) */
const _capTallyMem = new Map(); // key = uid|kind|YYYY-MM
const mkKey = (uid, kind, mk) => `${uid}|${kind}|${mk}`;
async function dbGetTally(uid, kind, mk) {
    return _capTallyMem.get(mkKey(uid, kind, mk)) ?? 0;
}
async function dbBumpTally(uid, kind, mk, delta) {
    const k = mkKey(uid, kind, mk);
    _capTallyMem.set(k, (_capTallyMem.get(k) ?? 0) + delta);
}
/* ---- DB stubs (swap to Firestore later) ---- */
const DB = {
    async getAthlete(uid) {
        // @ts-ignore
        return (window._athDir?.[uid]) || {
            uid, track: 'F8', padlock_id: '0001', tier: 'T0',
            xp_total: 0, xp_by_lane: {}, comp_gate: 800, status: 'pending'
        };
    },
    async saveAthlete(a) {
        // @ts-ignore
        window._athDir = window._athDir || {};
        window._athDir[a.uid] = a;
        return a;
    },
    async writeAudit(entry) { /* TODO Firestore */ return entry; },
};
/* ---- Caps (example pilot defaults) ---- */
exports.CAPS = {
    attendance_monthly: 120, // e.g., +10/day hard cap 12 days
    character_monthly_athlete: 4, // +5 each (20 XP)
    tournament_shows_monthly: 2, // +15 each (30 XP)
    leadership_monthly: 100 // example global cap
};
/* Helper: month key */
const monthKey = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
/* ---- The gateway ---- */
async function callInc(p) {
    const lane = normalizeLane(p.lane_id);
    const mk = monthKey(p.created_at);
    // 1) enforce caps by kind + month (sample rules; expand later)
    let req = p.amount;
    let cap = Infinity;
    if (p.kind === 'attendance')
        cap = exports.CAPS.attendance_monthly;
    if (p.kind === 'tournament')
        cap = exports.CAPS.tournament_shows_monthly * 15; // example: +15/show
    if (p.kind === 'character')
        cap = (exports.CAPS.character_monthly_athlete ?? 0) * 5;
    if (p.kind === 'leadership_task' || p.kind === 'honor_task')
        cap = exports.CAPS.leadership_monthly ?? 100;
    const used = await dbGetTally(p.athlete_uid, p.kind, mk);
    const remaining = Math.max(0, cap - used);
    const applied = Math.max(0, Math.min(remaining, req));
    if (applied === 0) {
        await DB.writeAudit({ id: '', actor: p.created_by, type: 'xp_inc_blocked', target: { kind: 'athlete', id: p.athlete_uid },
            meta: { lane, kind: p.kind, requested: req, used, cap, mk }, ts: Date.now() });
        return { ok: false, applied: 0, reason: `Cap reached for ${p.kind} in ${mk}` };
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
        id: '', actor: p.created_by, type: 'xp_inc',
        target: { kind: 'athlete', id: p.athlete_uid },
        meta: { lane, kind: p.kind, requested: req, applied, note: p.note, source_log_id: p.source_log_id, month_key: mk },
        ts: p.created_at
    });
    await dbBumpTally(p.athlete_uid, p.kind, mk, applied);
    return { ok: true, applied };
}
/* =========================================================
   Coaching / Parent / Athlete helpers (UI calls)
   ========================================================= */
/* --- Parent Invite / Intake --- */
async function makeParentTokenLink(baseUrl, track, preUid) {
    const token = crypto.randomUUID();
    // @ts-ignore
    window._intakes = window._intakes || {};
    // @ts-ignore
    window._intakes[token] = { id: token, snapshot: { track, uid: preUid ?? null }, status: 'draft', createdAt: Date.now(), updatedAt: Date.now() };
    return { token, link: `${baseUrl}?token=${token}` };
}
async function submitParentIntake(token, form) {
    // @ts-ignore
    const rec = (window._intakes || {})[token];
    const track = form.track || rec?.snapshot?.track || 'F8';
    const uid = rec?.uid || mintUid(track);
    const athlete = {
        uid, track, padlock_id: form.padlock || '0001',
        publicName: form.publicName, privateFirst: form.first, privateLast: form.last,
        tier: form.tier || 'T0', xp_total: 0, xp_by_lane: {}, comp_gate: 800, status: 'pending',
        created_at: Date.now(), updated_at: Date.now(), parentIds: []
    };
    await DB.saveAthlete(athlete);
    // @ts-ignore
    window._intakes[token] = { ...(rec || {}), id: token, uid, snapshot: form, status: 'submitted', updatedAt: Date.now() };
    return athlete;
}
async function approveAndActivate(uid, patch = {}, actor = 'coach') {
    const a = await DB.getAthlete(uid);
    Object.assign(a, patch, { status: 'active', updated_at: Date.now() });
    await DB.saveAthlete(a);
    await DB.writeAudit({ id: '', actor, type: 'approve_activate', target: { kind: 'athlete', id: uid }, ts: Date.now() });
    return a;
}
/* --- Events / Logs quick creators (storage-agnostic) --- */
function makeAudience(o = {}) {
    return { coach: true, parent: false, athlete: true, ...o };
}
function createEvent(ev) {
    const e = { id: crypto.randomUUID(), created_at: Date.now(), updated_at: Date.now(), ...ev };
    // @ts-ignore
    window._events = window._events || [];
    window._events.push(e);
    return e;
}
function createLog(lg) {
    const l = { id: crypto.randomUUID(), ts: Date.now(), ...lg };
    // @ts-ignore
    window._logs = window._logs || [];
    window._logs.push(l);
    return l;
}
/* --- Daily / Weekly / Tournament writers --- */
function saveDaily(args) {
    const ev = createEvent({
        scope: 'daily', title: args.title, body: args.body, date: args.date,
        audience: makeAudience({ parent: !!args.shareToParents }),
        athletes: args.athletes ?? null, tags: ['daily'], created_by: args.by || 'coach',
    });
    (args.athletes || []).forEach(uid => createLog({
        kind: 'practice_note', scope: 'daily', lane_id: 'combat', athlete_uid: uid,
        text: args.body || args.title, audience: makeAudience({ parent: !!args.shareToParents }),
        created_by: args.by || 'coach'
    }));
    return ev;
}
const saveWeekly = (args) => createEvent({ scope: 'weekly', title: args.title, body: args.body, date: args.start, date_end: args.end,
    lane_id: args.lane_id, audience: exports.AUDIENCE.allThree(), tags: ['weekly'], created_by: args.by || 'coach' });
exports.saveWeekly = saveWeekly;
const saveTournament = (args) => createEvent({ scope: 'tournament', title: args.title, body: `${args.body || ''}${args.where ? ` • ${args.where}` : ''}`,
    date: args.when, audience: exports.AUDIENCE.allThree(), athletes: args.athletes ?? null, tags: ['tournament'], created_by: args.by || 'coach' });
exports.saveTournament = saveTournament;
function tournamentRecap(items, by = 'coach') {
    items.forEach(({ uid, recap, xpDelta = 0, lane = 'combat' }) => {
        createLog({ kind: 'tournament_note', scope: 'weekly', lane_id: lane, athlete_uid: uid,
            text: recap, payload: { xpDelta }, audience: exports.AUDIENCE.allThree(), created_by: by });
        if (xpDelta)
            callInc({ athlete_uid: uid, lane_id: lane, kind: 'tournament', amount: xpDelta, created_by: by, created_at: Date.now(), note: 'tournament recap' });
    });
}
/* --- Attendance hook (log + emergency grant + XP gateway friendly) --- */
function markAttendance(uid, fullEffort = true, by = 'coach') {
    createLog({
        kind: 'attendance', scope: 'daily', lane_id: 'combat', athlete_uid: uid,
        text: fullEffort ? 'Full effort +10' : 'Half effort +5',
        audience: exports.AUDIENCE.allThree(), created_by: by
    });
    // XP via gateway (lets caps work)
    callInc({
        athlete_uid: uid, lane_id: 'combat', kind: 'attendance',
        amount: fullEffort ? 10 : 5, created_by: by, created_at: Date.now(), note: 'practice attendance'
    });
    // Ephemeral emergency card grant (12h)
    createLog({
        kind: 'audit', lane_id: 'combat', text: 'Emergency 12h access granted after attendance.',
        audience: exports.AUDIENCE.coachOnly(), created_by: by
    });
}
/* --- Skillsheet helpers --- */
function assignSkill(uid, label, lane = 'combat', tag = 'technique') {
    // @ts-ignore
    window._skill = window._skill || {};
    // @ts-ignore
    const s = window._skill[uid] || { uid, assigned: [], progress: [], updatedAt: Date.now() };
    const id = crypto.randomUUID();
    s.assigned.push(id);
    s.progress.push({ skillId: id, status: 'new', lastTouchedAt: Date.now() });
    // @ts-ignore
    window._skill[uid] = s;
    createLog({ kind: 'practice_note', scope: 'daily', lane_id: lane, athlete_uid: uid,
        text: `Assigned: ${label}`, audience: exports.AUDIENCE.coachAth(), created_by: 'coach' });
    return id;
}
/* --- Simple meter compute (for athlete page header) --- */
function computeTierProgress(uid) {
    // @ts-ignore
    const a = (window._athDir || {})[uid];
    if (!a)
        return { track: 'F8', tier: 'T0', rank: '-', xp: 0, cap: 800, pct: 0 };
    const track = a.track || 'F8';
    const caps = (track === 'F8' ? exports.F8_TIERS : exports.F4_TIERS).reduce((m, t) => { m[t.code] = t.capXp || m[t.code] || 800; return m; }, {});
    const tier = a.tier || 'T0';
    const cap = caps[tier] || 800;
    const xp = a.xp_total | 0;
    const pct = Math.min(100, Math.round((xp / cap) * 100));
    const rank = (track === 'F8' ? exports.F8_TIERS : exports.F4_TIERS).find(t => t.code === tier)?.name || '-';
    return { track, tier, rank, xp, cap, pct };
}
/* --- Tiny helpers --- */
function mintUid(track, now = new Date()) {
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const seq = Math.floor(Math.random() * 9999) + 1;
    return `${track}-${yy}${mm}-${String(seq).padStart(4, '0')}`;
}
/* =========================================================
   Optional: Button binder (IDs → functions). Safe to remove
   ========================================================= */
function bindCoachUI(doc = document) {
    const q = (id) => doc.getElementById(id);
    q('btn-intake-token')?.addEventListener('click', async () => {
        // @ts-ignore
        const out = await makeParentTokenLink(location.origin + location.pathname, doc.getElementById('intake-track')?.value || 'F8');
        const el = doc.getElementById('intake-link');
        if (el)
            el.value = out.link;
    });
    q('btn-approve-activate')?.addEventListener('click', async () => {
        const uid = doc.getElementById('aa-uid')?.value?.trim();
        const tier = doc.getElementById('aa-tier')?.value || 'T0';
        if (!uid)
            return alert('UID required');
        await approveAndActivate(uid, { tier }, 'coach');
        alert('Activated & seeded');
    });
    q('btn-daily-save')?.addEventListener('click', () => {
        const title = doc.getElementById('daily-title')?.value || 'Practice';
        saveDaily({ title, shareToParents: false, athletes: [] });
        alert('Daily saved');
    });
    q('btn-attendance-full')?.addEventListener('click', () => {
        const uid = doc.getElementById('att-uid')?.value?.trim();
        if (!uid)
            return;
        markAttendance(uid, true);
    });
    q('btn-assign-skill')?.addEventListener('click', () => {
        const uid = doc.getElementById('skill-uid')?.value?.trim();
        if (!uid)
            return;
        const label = doc.getElementById('skill-label')?.value || 'Single → Shelf';
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
