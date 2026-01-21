// /public/js/coach/coach-activate.js
// Coach: find submitted intakes → load → Approve & Activate
// Works with your test DB shim (DB.add/set/get/query) and the IDs you already have.

(() => {
  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ---------- Track & Tier/Ranks ----------
  const TIERS = {
    foundry8: [ ['t0','T0 · Shadow'], ['t1','T1 · Recruit'], ['t2','T2 · Combatant'],
                ['t3','T3 · Competitor'], ['t4','T4 · Warrior'], ['t5','T5 · Champion'],
                ['t6','T6 · Commander'], ['t7','T7 · Sandman'], ['t8','T8 · Hero'] ],
    foundry4: [ ['t0','T0 · Apprentice'], ['t1','T1 · Warrior'], ['t2','T2 · Champion'],
                ['t3','T3 · Veteran'], ['t4','T4 · Legend'] ]
  };
  const prefixFor = (track) => track === 'foundry4' ? 'F4' : 'F8';

  function fillTierOptions(track, keepValue) {
    const sel = $('intake-tier');
    if (!sel) return;
    sel.innerHTML = '';
    (TIERS[track] || []).forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      if (keepValue && keepValue === val) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ---------- Mint helpers ----------
  async function mintUid(track) {
    // Dev-only: make a fake incremental for readability
    const n = Math.floor(Math.random()*9000)+1000; // 1000..9999
    return `${prefixFor(track)}-${n}`;
  }

  // ---------- Load latest submitted intakes ----------
  async function listSubmittedIntakes() {
    const ul = $('ca-intakes');
    if (!ul) return;
    ul.innerHTML = '<li class="muted">Searching…</li>';

    const rows = await DB.query('intakes', x => x.status === 'submitted');
    if (!rows || !rows.length) { ul.innerHTML = '<li class="muted">No submitted intakes.</li>'; return; }

    ul.innerHTML = '';
    rows.sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
    rows.slice(0,10).forEach(row => {
      const li = document.createElement('li');
      const when = new Date(row.createdAt||Date.now()).toLocaleString();
      li.textContent = `• [${when}] ${row.athleteFirst||''} ${row.athleteLast||''}  token:${row.inviteToken||'—'}`;
      const btn = document.createElement('button');
      btn.textContent = 'Load';
      btn.className = 'chip';
      btn.style.marginLeft = '8px';
      btn.addEventListener('click', () => loadIntake(row));
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  // ---------- Pre-fill Approve & Activate from an intake ----------
  function loadIntake(intake) {
    // Track from current selector
    const trackSel = $('intake-track');
    const track = trackSel?.value || 'foundry8';
    fillTierOptions(track);

    // Pick a sensible default tier (T0)
    $('intake-tier').value = TIERS[track][0][0];

    // Public name suggestion
    const pub = `${(intake.athleteFirst||'').slice(0,1)}. ${(intake.athleteLast||'')}`.trim();
    if ($('ca-public')) $('ca-public').value = pub;

    // Stash currently loaded intake id on the Approve button (simple way to carry it)
    const approveBtn = $('ca-approve');
    approveBtn.dataset.intakeId = intake.id || '';
    setStatus('Intake loaded. Ready to approve.');
  }

  // ---------- Approve & Activate (dev stub) ----------
  async function approveAndActivate() {
    const track = $('intake-track').value || 'foundry8';
    const tierVal = $('intake-tier').value; // e.g., 't0'
    const tierLabel = (TIERS[track].find(([v]) => v === tierVal) || [,''])[1];
    const uidInput = $('ca-uid');
    let uid = (uidInput?.value || '').trim();
    if (!uid) uid = await mintUid(track);

    const publicName = $('ca-public')?.value.trim() || '';

    // Seed athlete document (dev)
    const athlete = {
      id: uid,
      track,
      tier: tierVal,           // normalized code
      tierLabel,               // human label
      xp: 0,
      createdAt: Date.now(),
      publicName,
      role: 'athlete'
    };
    await DB.add('athletes', athlete);

    // Seed welcome + 2 starter skills (very light)
    await DB.add('events', { id:'', scope:'system', title:'Welcome to Sandman', audience:{coach:true,athlete:true,parent:true},
                             createdAt: Date.now(), athleteId: uid });
    await DB.add('skills', { id:'', athleteId: uid, text:'Stance & Motion', tag:'technique', createdAt: Date.now() });
    await DB.add('skills', { id:'', athleteId: uid, text:'Single-Leg Finish (Basics)', tag:'finish', createdAt: Date.now() });

    // Mark intake as consumed if present
    const intakeId = $('ca-approve').dataset.intakeId;
    if (intakeId) await DB.set('intakes', intakeId, { status:'approved', approvedAt: Date.now(), uid });

    if (uidInput) uidInput.value = uid;
    setStatus(`Approved & activated as ${uid}.`);
    console.log('[coach] activated', athlete);

    // Refresh list so that consumed intake disappears
    listSubmittedIntakes();
  }

  function setStatus(msg) {
    const el = $('ca-status');
    if (el) el.textContent = msg;
  }

  // ---------- Wire up page ----------
  function init() {
    // Fill tiers based on current track
    const trackSel = $('intake-track');
    const keep = $('intake-tier')?.value || '';
    fillTierOptions(trackSel?.value || 'foundry8', keep);

    on(trackSel, 'change', () => fillTierOptions(trackSel.value));

    // Mint helpers (just set the track dropdown for clarity; UID is generated on approve if empty)
    on($('ca-mint-f8'), 'click', () => { if (trackSel) trackSel.value = 'foundry8'; fillTierOptions('foundry8'); });
    on($('ca-mint-f4'), 'click', () => { if (trackSel) trackSel.value = 'foundry4'; fillTierOptions('foundry4'); });

    // Buttons
    on($('ca-refresh'), 'click', listSubmittedIntakes);
    on($('ca-approve'), 'click', approveAndActivate);

    // Auto-load list on open
    listSubmittedIntakes();

    console.log('[coach-activate] ready');
  }

  // Kick
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
console.log("[OK] coach-activate.js loaded");
// /public/js/coach/coach-activate.js
(() => {
  const byId = (id) => document.getElementById(id);

  // Fill Tier/Rank select using the same TIER map you already added on the page.
  function ensureTierList(track) {
    if (!window.TIERS) return;
    const sel = byId('intake-tier');
    if (!sel) return;
    sel.innerHTML = '';
    (window.TIERS[track] || []).forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      sel.appendChild(opt);
    });
  }

  // Render small list of recent intakes
  function renderIntakes(items) {
    const ul = byId('ca-intakes');
    if (!ul) return;
    ul.innerHTML = '';
    if (!items.length) {
      ul.innerHTML = '<li class="muted">No submitted intakes.</li>';
      return;
    }
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const when = new Date(it.createdAt || Date.now()).toLocaleString();
      li.innerHTML = `
        <div>
          <strong>${it.athleteFirst || '—'} ${it.athleteLast || ''}</strong>
          <span class="muted mono"> · ${when}</span>
          <div class="muted small mono">token:${it.inviteToken || '—'}</div>
        </div>
        <button class="chip" data-idx="${i}" style="margin-top:6px">Load</button>
      `;
      ul.appendChild(li);
    });

    // attach loaders
    ul.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.getAttribute('data-idx');
        const chosen = items[idx];
        loadIntoForm(chosen);
      });
    });
  }

  // Put chosen intake into the Approve & Activate inputs
  function loadIntoForm(data) {
    // Track → re-fill Tier list to match track
    const trackSel = byId('intake-track');
    if (trackSel && data.track) trackSel.value = data.track;
    ensureTierList(trackSel ? trackSel.value : 'foundry8');

    // Public name: "R. Sandoval"
    if (byId('ca-public')) {
      const first = (data.athleteFirst || '').trim();
      const last  = (data.athleteLast || '').trim();
      const pub = first ? `${first[0].toUpperCase()}. ${last}` : last || '';
      byId('ca-public').value = pub;
    }

    // Padlock (optional)
    if (byId('ca-padlock')) byId('ca-padlock').value = (data.padlockId || '').toString();

    // Tier select — default to T0 if empty
    const tierSel = byId('intake-tier');
    if (tierSel) tierSel.value = (data.tierVal || 't0');

    // Status line
    const st = byId('ca-status');
    if (st) st.textContent = `Loaded intake for ${data.athleteFirst || ''} ${data.athleteLast || ''}. Set track/tier and click Approve & Activate.`;
  }

  // Pull recent submitted intakes
  async function findSubmitted() {
    const st = byId('ca-status');
    if (st) st.textContent = 'Searching…';
    try {
      // Keep it simple: fetch all, filter & sort newest first
      const rows = await DB.query('intakes', x => true);
      const list = (rows || [])
        .filter(x => (x.status || '').toLowerCase() === 'submitted')
        .sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
        .slice(0, 10);
      renderIntakes(list);
      if (st) st.textContent = list.length ? 'Select an intake to load.' : 'No submitted intakes.';
    } catch (e) {
      console.error('[coach] findSubmitted error', e);
      if (st) st.textContent = 'Error loading intakes.';
    }
  }

  // Wire buttons
  function init() {
    const trackSel = byId('intake-track');
    if (trackSel) {
      trackSel.addEventListener('change', () => ensureTierList(trackSel.value));
      // prime once
      ensureTierList(trackSel.value || 'foundry8');
    }
    const btn = byId('ca-refresh');   // "Find Submitted Intakes"
    if (btn) btn.addEventListener('click', findSubmitted);
  }

  // Expose for dev if you want to call manually
  window.caFindSubmitted = findSubmitted;

  // Kick off
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
// /public/js/coach/coach-activate.js
(() => {
  const byId = (id) => document.getElementById(id);

  function ensureTierList(track) {
    if (!window.TIERS) return;
    const sel = byId('intake-tier');
    if (!sel) return;
    sel.innerHTML = '';
    (window.TIERS[track] || []).forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; 
      opt.textContent = label;
      sel.appendChild(opt);
    });
  }

  function renderIntakes(items) {
    const ul = byId('ca-intakes');
    if (!ul) return;
    ul.innerHTML = '';
    if (!items.length) {
      ul.innerHTML = '<li class="muted">No submitted intakes.</li>';
      return;
    }
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const when = new Date(it.createdAt || Date.now()).toLocaleString();
      li.innerHTML = `
        <div>
          <strong>${it.athleteFirst || '—'} ${it.athleteLast || ''}</strong>
          <span class="muted mono"> · ${when}</span>
          <div class="muted small mono">token:${it.inviteToken || '—'}</div>
        </div>
        <button class="chip" data-idx="${i}" style="margin-top:6px">Load</button>
      `;
      ul.appendChild(li);
    });
    ul.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.getAttribute('data-idx');
        const chosen = items[idx];
        loadIntoForm(chosen);
      });
    });
  }

  function loadIntoForm(data) {
    const trackSel = byId('intake-track');
    if (trackSel && data.track) trackSel.value = data.track;
    ensureTierList(trackSel ? trackSel.value : 'foundry8');

    if (byId('ca-public')) {
      const first = (data.athleteFirst || '').trim();
      const last  = (data.athleteLast || '').trim();
      const pub = first ? `${first[0].toUpperCase()}. ${last}` : last || '';
      byId('ca-public').value = pub;
    }

    if (byId('ca-padlock')) byId('ca-padlock').value = (data.padlockId || '').toString();
    const tierSel = byId('intake-tier');
    if (tierSel) tierSel.value = (data.tierVal || 't0');

    const st = byId('ca-status');
    if (st) st.textContent = `Loaded intake for ${data.athleteFirst || ''} ${data.athleteLast || ''}. Set track/tier and click Approve & Activate.`;
  }

  async function findSubmitted() {
    const st = byId('ca-status');
    if (st) st.textContent = 'Searching…';
    try {
      const rows = await DB.query('intakes', x => true);
      const list = (rows || [])
        .filter(x => (x.status || '').toLowerCase() === 'submitted')
        .sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
        .slice(0, 10);
      renderIntakes(list);
      if (st) st.textContent = list.length ? 'Select an intake to load.' : 'No submitted intakes.';
    } catch (e) {
      console.error('[coach] findSubmitted error', e);
      if (st) st.textContent = 'Error loading intakes.';
    }
  }

  function init() {
    const trackSel = byId('intake-track');
    if (trackSel) {
      trackSel.addEventListener('change', () => ensureTierList(trackSel.value));
      ensureTierList(trackSel.value || 'foundry8');
    }
    const btn = byId('ca-refresh');
    if (btn) btn.addEventListener('click', findSubmitted);
  }

  window.caFindSubmitted = findSubmitted;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
// ---------- helpers ----------
function mintUid(prefix='F8') {
  const n = Math.floor(1 + Math.random() * 9999);
  return `${prefix}-${String(n).padStart(4,'0')}`;
}

function byId(id){ return document.getElementById(id); }

// ---------- buttons ----------
window.caFindIntakes = async function () {
  const all = await DB.query('intakes', x => x.status === 'submitted');
  const log = byId('ca-status');
  if (!all.length) { log.textContent = 'No submitted intakes.'; return; }
  // show the most recent for Level-1 plumbing
  const intake = all.sort((a,b) => b.createdAt - a.createdAt)[0];
  window.__currentIntake = intake;
  // Hydrate the Identity & Privacy fields
  byId('intake-first').value = intake.first || '';
  byId('intake-last').value  = intake.last  || '';
  byId('intake-initial').value = (intake.first ? `${intake.first[0]}.` : '');
  byId('intake-public-last').value = intake.last || '';
  // Track/Tier defaults are already on the page; leave as-is
  log.textContent = `${intake.first} ${intake.last} • ${new Date(intake.createdAt).toLocaleString()}`;
};

window.caMintF8 = function () {
  byId('ca-uid').value = mintUid('F8');
};
window.caMintF4 = function () {
  byId('ca-uid').value = mintUid('F4');
};

window.caApprove = async function () {
  const intake = window.__currentIntake;
  const uid = byId('ca-uid').value.trim();
  if (!intake || !uid) { byId('ca-status').textContent = 'Missing intake or UID.'; return; }

  const track = byId('ca-track')?.value || 'foundry8';
  const tier  = byId('ca-tier')?.value  || 'T0';
  const pub   = byId('ca-public')?.value || `${byId('intake-initial').value} ${byId('intake-public-last').value}`.trim();

  const athlete = {
    uid, track, tier,
    first: byId('intake-first').value.trim(),
    last:  byId('intake-last').value.trim(),
    publicName: pub,
    xp: 0,
    compGate: 800,
    createdAt: Date.now()
  };

  await DB.set('athletes', uid, athlete);
  await DB.set('intakes', intake.id, { ...intake, status:'approved', athleteUid: uid, approvedAt: Date.now() });

  // make Athlete Corner show this athlete
  window.SESSION = window.SESSION || {};
  window.SESSION.currentAthleteUid = uid;

  if (typeof window.showAthlete === 'function') {
    window.showAthlete(uid);
  }
  byId('ca-status').textContent = `Activated ${athlete.publicName} • ${uid}`;
};
