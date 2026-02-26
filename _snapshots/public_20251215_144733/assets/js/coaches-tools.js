import { db } from './firebase-init.js';
// ---------- Element map ----------
const els = {
  // top bar
  newBtn:        document.getElementById('newPlanBtn'),
  saveBtn:       document.getElementById('saveBtn'),
  exportBtn:     document.getElementById('exportBtn'),
  printBtn:      document.getElementById('printBtn'),
  status:        document.getElementById('status'),

  // editor
  title:         document.getElementById('planTitle'),
  sport:         document.getElementById('sportSelect') || null, // optional
  tags:          document.getElementById('planTags'),
  templateSel:   document.getElementById('templateSelect'),
  insertTplBtn:  document.getElementById('insertTemplate'),
  clearBtn:      document.getElementById('clearPlan'),
  editor:        document.getElementById('planContent'),

  // saved plans
  filterSport:   document.getElementById('savedSportFilter'),
  search:        document.getElementById('savedSearch'),
  refresh:       document.getElementById('reloadPlans'),
  list:          document.getElementById('savedList'),

  // curriculum
  currNote:      document.getElementById('curriculumNotes'),
  saveCurrBtn:   document.getElementById('saveNotesBtn'),
  currStatus:    document.getElementById('currStatus') || { textContent: '' },
};

// ---------- Storage ----------
const KEYS = {
  plans: 'coachPlansV2',
  lastPlanId: 'coachPlansV2:last',
  curriculum: 'curriculumNotesV2',
};

function loadPlans() {
  try { return JSON.parse(localStorage.getItem(KEYS.plans) || '[]'); }
  catch { return []; }
}
function savePlans(plans) {
  localStorage.setItem(KEYS.plans, JSON.stringify(plans));
}
function loadCurriculumNotes() {
  try { return JSON.parse(localStorage.getItem(KEYS.curriculum) || '{}'); }
  catch { return {}; }
}
function saveCurriculumNotes(map) {
  localStorage.setItem(KEYS.curriculum, JSON.stringify(map));
}

// ---------- State ----------
let plans = loadPlans();
let currentId = localStorage.getItem(KEYS.lastPlanId) || null;
const now = () => Date.now();
const uid = () => 'p_' + Math.random().toString(36).slice(2) + now().toString(36);
function currentSport() { return (els.sport && els.sport.value) || 'wrestling'; }

// ---------- Helpers ----------
function setStatus(msg, kind='ok') {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.classList.remove('text-warn','text-err');
  if (kind === 'warn') els.status.classList.add('text-warn');
  if (kind === 'err')  els.status.classList.add('text-err');
}
function parseTags(s) {
  return (s || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 12);
}
function planToText(p) {
  const tagStr = p.tags && p.tags.length ? `#${p.tags.join(' #')}` : '';
  const dt = new Date(p.updated).toLocaleString();
  return [
    `Title: ${p.title}`,
    `Sport: ${labelForSport(p.sport)}`,
    `Tags: ${tagStr || '(none)'}`,
    `Updated: ${dt}`,
    ``,
    `--- Plan ---`,
    p.body || '(empty)'
  ].join('\n');
}
function labelForSport(val) {
  switch (val) {
    case 'wrestling':  return 'Wrestling';
    case 'boxing':     return 'Boxing';
    case 'kickboxing': return 'Kickboxing';
    case 'submission': return 'Submission Grappling';
    case 'mma':        return 'MMA';
    default:           return val || '—';
  }
}

// ---------- Templates ----------
const TEMPLATES = {
  'warmup-technique-live': `WARM-UP (10–15m)
- General movement, tumbling, stance/motion
- Hand fighting, pummeling, mat returns

TECHNIQUE (20–30m)
- Focus 1: Setup → Shot → Finish chain
- Focus 2: Top ride → turn (tight waist + chop → half series)
- Positional sparring: start in crackdown / front head

LIVE / GOES (15–25m)
- 3 x 3m live (start on feet)
- 2 x 2m live (start on top/bottom)

CONDITIONING (10m)
- Core + grip circuit
- Finisher: sprints / sleds

COOL DOWN (5m)
- Breathe, stretch, recap, 1 affirmation`,

  'conditioning-focused': `WARM-UP (10m)
- Mobility flow + activation

BLOCK 1: POWER (15m)
- Med-ball throws, jumps, short sprints

BLOCK 2: STRENGTH (20m)
- 3–4 lifts (push/pull/hinge/squat), 3x6–8

BLOCK 3: GRAPPLING CONDITIONING (12m)
- EMOM: shots to mat returns, rope climbs, carries

COOL DOWN (5m)
- Box breathing + stretch`,

  'competition-prep': `WARM-UP (10m)
- Sweat up + reaction drills

TACTICAL (20m)
- First contact plan (A/B/C entries)
- Top/bottom first moves scripted

SCOUT / FILM (10m)
- Opp tendencies. “If X, we do Y.”

LIVE GOES (15m)
- 3 x 2m hard, 1 x 1m flurry

RECOVERY (10m)
- Breathe, visualize, affirmations`
};

// ---------- Library ----------
function renderList() {
  if (!els.list) return;
  els.list.innerHTML = '';

  const sportFilter = els.filterSport?.value || '';
  const q = (els.search?.value || '').toLowerCase();

  const rows = plans
    .filter(p => !sportFilter || sportFilter === 'all' || p.sport === sportFilter)
    .filter(p => {
      if (!q) return true;
      const hay = [p.title, p.body, ...(p.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b) => b.updated - a.updated);

  if (!rows.length) {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.textContent = 'No saved plans.';
    els.list.appendChild(div);
    return;
  }

  rows.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;max-width:70%;">
        <strong>${i+1}.</strong>
        <div>
          <div style="font-weight:700;">${escapeHtml(p.title || '(untitled)')}</div>
          <div style="font-size:12px;opacity:.8;">
            ${labelForSport(p.sport)} • ${new Date(p.updated).toLocaleString()}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn ghost" data-act="load"   data-id="${p.id}">Open</button>
        <button class="btn ghost" data-act="export" data-id="${p.id}">Export</button>
        <button class="btn ghost" data-act="delete" data-id="${p.id}">Delete</button>
      </div>
    `;
    els.list.appendChild(item);
  });
}
function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Load / Save ----------
function loadPlanIntoEditor(id) {
  const p = plans.find(x => x.id === id);
  if (!p) return setStatus('Plan not found', 'err');
  currentId = id;
  localStorage.setItem(KEYS.lastPlanId, id);

  els.title.value = p.title || '';
  if (els.sport) els.sport.value = p.sport || 'wrestling';
  els.tags.value  = (p.tags || []).join(', ');
  els.editor.value = p.body || '';
  setStatus('Loaded.');
}
function collectEditor() {
  return {
    title: (els.title.value || '').trim(),
    sport: currentSport(),
    tags:  parseTags(els.tags.value),
    body:  els.editor.value || ''
  };
}
function saveCurrent() {
  const data = collectEditor();
  if (!data.title && !data.body) {
    setStatus('Nothing to save (title or body required)', 'warn');
    return;
  }
  const stamp = now();

  if (currentId) {
    const idx = plans.findIndex(p => p.id === currentId);
    if (idx >= 0) {
      plans[idx] = { ...plans[idx], ...data, updated: stamp };
    } else {
      plans.push({ id: currentId, ...data, updated: stamp });
    }
  } else {
    currentId = uid();
    plans.push({ id: currentId, ...data, updated: stamp });
    localStorage.setItem(KEYS.lastPlanId, currentId);
  }
  savePlans(plans);
  renderList();
  setStatus('Saved.');
}
function newPlan() {
  currentId = null;
  localStorage.removeItem(KEYS.lastPlanId);
  els.title.value = '';
  if (els.sport) els.sport.value = 'wrestling';
  els.tags.value = '';
  els.editor.value = '';
  setStatus('New plan ready.');
}

// ---------- Export / Print ----------
function exportCurrent() {
  const id = currentId;
  if (!id) return setStatus('Save first, then export.', 'warn');
  const p = plans.find(x => x.id === id);
  if (!p) return setStatus('Plan not found', 'err');

  const text = planToText(p);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = (p.title?.trim() || 'plan') + '.txt';
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported .txt');
}
function printCurrent() {
  const data = collectEditor();
  const win = window.open('', '_blank');
  if (!win) return setStatus('Popup blocked', 'warn');
  win.document.write(`
    <html><head><title>${escapeHtml(data.title || 'Practice Plan')}</title></head>
    <body style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; padding:24px;">
      <h2>${escapeHtml(data.title || 'Practice Plan')}</h2>
      <div><strong>Sport:</strong> ${escapeHtml(labelForSport(data.sport))}</div>
      <div><strong>Tags:</strong> ${escapeHtml((data.tags || []).join(', ') || '—')}</div>
      <hr/>
      <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(data.body || '')}</pre>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
  setStatus('Print dialog opened.');
}

// ---------- Curriculum ----------
function loadCurriculumForSport() {
  const map = loadCurriculumNotes();
  els.currNote.value = map[currentSport()] || '';
  els.currStatus.textContent = '';
}
function saveCurriculum() {
  const sport = currentSport();
  const map = loadCurriculumNotes();
  map[sport] = els.currNote.value || '';
  saveCurriculumNotes(map);
  els.currStatus.textContent = 'Saved ✓';
  setTimeout(() => els.currStatus.textContent = '', 1200);
}

// ---------- Events ----------
els.newBtn?.addEventListener('click', newPlan);
els.saveBtn?.addEventListener('click', saveCurrent);
els.exportBtn?.addEventListener('click', exportCurrent);
els.printBtn?.addEventListener('click', printCurrent);

els.insertTplBtn?.addEventListener('click', () => {
  const key = els.templateSel.value;
  if (!key) return;
  const text = TEMPLATES[key] || '';
  const existing = els.editor.value || '';
  els.editor.value = existing ? (existing + '\n\n' + text) : text;
  setStatus('Template inserted.');
});
els.clearBtn?.addEventListener('click', () => {
  els.editor.value = '';
  setStatus('Editor cleared.');
});

els.refresh?.addEventListener('click', renderList);
els.filterSport?.addEventListener('change', renderList);
els.search?.addEventListener('input', renderList);

els.list?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  const p = plans.find(x => x.id === id);

  if (act === 'load') {
    loadPlanIntoEditor(id);
    if (p?.sport && els.sport && els.sport.value !== p.sport) {
      els.sport.value = p.sport;
      loadCurriculumForSport();
    }
  } else if (act === 'export') {
    if (!p) return;
    const text = planToText(p);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = (p.title?.trim() || 'plan') + '.txt';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  } else if (act === 'delete') {
    if (confirm('Delete this plan?')) {
      plans = plans.filter(x => x.id !== id);
      savePlans(plans);
      if (currentId === id) {
        currentId = null;
        localStorage.removeItem(KEYS.lastPlanId);
        newPlan();
      }
      renderList();
      setStatus('Deleted.');
    }
  }
});

if (els.sport) {
  els.sport.addEventListener('change', loadCurriculumForSport);
}
els.saveCurrBtn?.addEventListener('click', saveCurriculum);

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  if ((isMac && e.metaKey && e.key.toLowerCase() === 's') ||
      (!isMac && e.ctrlKey && e.key.toLowerCase() === 's')) {
    e.preventDefault();
    saveCurrent();
  }
});

// ---------- Init ----------
function ensureSubmissionMigrated() {
  let touched = false;
  plans.forEach(p => {
    if (p.sport === 'bjj') { p.sport = 'submission'; touched = true; }
  });
  if (touched) savePlans(plans);
}
function bootstrap() {
  ensureSubmissionMigrated();
  renderList();
  if (currentId && plans.some(p => p.id === currentId)) {
    loadPlanIntoEditor(currentId);
  } else {
    newPlan();
  }
  loadCurriculumForSport();
  setStatus('Ready.');
}
bootstrap();
 