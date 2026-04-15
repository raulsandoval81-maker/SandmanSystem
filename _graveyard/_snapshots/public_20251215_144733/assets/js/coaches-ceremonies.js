// public/assets/js/coaches-ceremonies.js
// Module: used by /coaches/ceremonies.html

import {
  db, collection, doc, getDoc, getDocs, addDoc,
  query, where, orderBy, limit, serverTimestamp
} from './firebase-init.js';

/* ---------- tiny DOM helpers (no jQuery) ---------- */
const $  = (id)  => document.getElementById(id);                // by id (no '#')
const $$ = (sel) => Array.from(document.querySelectorAll(sel)); // by CSS selector

const statusEl = $('status');
const setStatus = (msg, cls = 'muted') => {
  if (!statusEl) return;
  statusEl.className = cls;
  statusEl.textContent = msg;
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  guard();
  wireButtons();
  await loadAthletes();
  await loadBadges();
  await loadRecentPromotions();
  setStatus('Ready.');
}

/* ---------- sanity check required elements ---------- */
function guard() {
  const ids = [
    'athleteSelect', 'badgeSelect', 'promoteBtn', 'coachNote',
    'promotionList', 'downloadScriptBtn', 'downloadBadgeBtn', 'sendDigitalBtn', 'status'
  ];
  const missing = ids.filter(id => !$(id));
  if (missing.length) console.error('[Ceremonies] Missing ids:', missing);
}

/* ---------- wire UI ---------- */
function wireButtons() {
  const promoteBtn = $('promoteBtn');
  if (promoteBtn) promoteBtn.addEventListener('click', promote);

  $('downloadScriptBtn')?.addEventListener('click', () =>
    downloadFile('/assets/docs/ceremony_script.pdf', 'Ceremony_Script.pdf')
  );

  $('downloadBadgeBtn')?.addEventListener('click', () =>
    downloadFile('/assets/docs/badge_template.pdf', 'Badge_Template.pdf')
  );

  $('sendDigitalBtn')?.addEventListener('click', () =>
    alert('Digital badge send (stub). Hook up when messaging is ready.')
  );
}

/* ---------- data loaders ---------- */
async function loadAthletes() {
  try {
    const sel = $('athleteSelect');
    if (!sel) return;

    // last 100 athletes, alphabetical if that index exists
    const q = query(collection(db, 'athletes'), orderBy('name'), limit(100));
    const snap = await getDocs(q);

    // clear (keep placeholder)
    sel.innerHTML = '<option value="">Select athlete…</option>';

    snap.forEach(docSnap => {
      const a = docSnap.data();
      const opt = document.createElement('option');
      opt.value = docSnap.id;
      // fallbacks: name || displayName || "First Last"
      opt.textContent = a?.name || a?.displayName || [a?.firstName, a?.lastName].filter(Boolean).join(' ') || '(no name)';
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('[Ceremonies] Could not load athletes (ok in dev):', e);
    setStatus('Error loading athletes.', 'text-err');
  }
}

async function loadBadges() {
  try {
    const sel = $('badgeSelect');
    if (!sel) return;

    sel.innerHTML = '<option value="">Select badge…</option>';

    // If you have a "badges" collection, read it. Otherwise use the fallback list.
    let rows = [];
    try {
      const q = query(collection(db, 'badges'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      // fallback static ladder
      rows = [
        { id: 'shadow',   name: 'Shadow (Lvl 0) – White'  },
        { id: 'recruit',  name: 'Recruit – Yellow'        },
        { id: 'combatant',name: 'Combatant – Orange'      },
        { id: 'competitor',name:'Competitor – Green'      },
        { id: 'warrior',  name: 'Warrior – Blue'          },
        { id: 'champion', name: 'Champion – Purple'       },
        { id: 'commander',name: 'Commander – Brown'       },
        { id: 'sandman',  name: 'Sandman – Gold'          },
        { id: 'legend',   name: 'Legend – Black'          }
      ];
    }

    rows.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name || b.title || b.id;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('[Ceremonies] Could not load badges:', e);
    setStatus('Error loading badges.', 'text-err');
  }
}

async function loadRecentPromotions() {
  const list = $('promotionList');
  if (!list) return;

  try {
    const q = query(
      collection(db, 'promotions'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = '<div class="muted">No promotions yet.</div>';
      return;
    }

    list.innerHTML = '';
    snap.forEach(d => {
      const p = d.data();
      const div = document.createElement('div');
      div.className = 'list-item';
      const who = p.athleteName || p.athleteId;
      const badge = p.badgeName || p.badgeId;
      const when = p.createdAt?.toDate?.().toLocaleString?.() || '';
      div.textContent = `${who} → ${badge}  ${when ? '· ' + when : ''}`;
      list.appendChild(div);
    });
  } catch (e) {
    console.warn('[Ceremonies] Could not load promotions:', e);
    list.innerHTML = '<div class="muted">Error loading promotions.</div>';
  }
}

/* ---------- actions ---------- */
async function promote() {
  const athleteId = $('athleteSelect')?.value?.trim();
  const badgeId   = $('badgeSelect')?.value?.trim();
  const note      = $('coachNote')?.value?.trim() || '';

  if (!athleteId || !badgeId) {
    setStatus('Pick an athlete and a badge first.', 'text-warn');
    return;
  }

  try {
    // (optional) fetch athlete name for nicer log
    let athleteName = athleteId;
    try {
      const aSnap = await getDoc(doc(db, 'athletes', athleteId));
      const a = aSnap.data();
      athleteName = a?.name || a?.displayName || [a?.firstName, a?.lastName].filter(Boolean).join(' ') || athleteId;
    } catch {}

    // (optional) badge name from select text
    const badgeName = $('badgeSelect')?.selectedOptions?.[0]?.textContent || badgeId;

    await addDoc(collection(db, 'promotions'), {
      athleteId,
      athleteName,
      badgeId,
      badgeName,
      note,
      createdAt: serverTimestamp()
    });

    setStatus(`Promoted ${athleteName} → ${badgeName}.`, 'text-ok');
    $('coachNote').value = '';
    await loadRecentPromotions();
  } catch (e) {
    console.error('[Ceremonies] Promote failed:', e);
    setStatus('Error logging promotion.', 'text-err');
  }
}

/* ---------- util ---------- */
function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
