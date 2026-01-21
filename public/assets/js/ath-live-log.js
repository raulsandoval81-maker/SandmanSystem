import { db, FIREBASE_OPEN } from "./firebase-init.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const QA = db ? collection(db, "coachesQA") : null;

async function render() {
  if (!FIREBASE_OPEN) {
    console.log("[QA] Skipping Firestore fetch (offline mode)");
    return;
  }
  const snap = await getDocs(query(QA, orderBy("createdAt", "desc")));
  // render docs...
}

async function addQA(question, answer) {
  if (!FIREBASE_OPEN) {
    console.log("[QA] Would add:", { question, answer });
    return;
  }
  await addDoc(QA, { question, answer, createdAt: serverTimestamp() });
}
(() => {
  const MATCH_KEY = 'athMatchCount';
  const LOG_KEY   = 'athLiveLog';

  const $ = id => document.getElementById(id);

  // Match Count elements
  const mcTotal = $('mcTotal');
  const mcPlus  = $('mcPlus');
  const mcMinus = $('mcMinus');
  const mcReset = $('mcReset');

  // Quick Entry elements
  const qDate = $('qDate'), qTitle = $('qTitle'), qSkill = $('qSkill');
  const qFocus = $('qFocus'), qEffort = $('qEffort'), qPerspective = $('qPerspective'), qRespect = $('qRespect');
  const qNote = $('qNote'), qSave = $('qSave'), qClear = $('qClear');

  // History
  const logTable = $('logTable');
  const exCSV = $('exCSV'), exJSON = $('exJSON');

  // Init date
  qDate.valueAsDate = new Date();

  /* ---------- Storage helpers ---------- */
  const loadCount = () => parseInt(localStorage.getItem(MATCH_KEY) || '0', 10);
  const saveCount = (n) => localStorage.setItem(MATCH_KEY, String(Math.max(0, n)));

  const loadLogs = () => JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  const saveLogs = (arr) => localStorage.setItem(LOG_KEY, JSON.stringify(arr));

  /* ---------- Renderers ---------- */
  function renderCount() {
    mcTotal.textContent = loadCount();
  }

  function renderTable() {
    const rows = loadLogs().sort((a,b)=>b.ts - a.ts);
    if (!rows.length) {
      logTable.innerHTML = `<tr><td colspan="6" class="muted">No entries yet.</td></tr>`;
      return;
    }
    logTable.innerHTML = rows.map((r,i) => {
      const fepr = [r.focus, r.effort, r.perspective, r.respect].map(n => (n ?? '–')).join('/');
      const skills = (r.skills||[]).map(s => `<span class="chip">${escapeHtml(s)}</span>`).join(' ');
      return `
      <tr>
        <td>${r.date}</td>
        <td>${escapeHtml(r.title||'')}</td>
        <td>${fepr}</td>
        <td>${skills}</td>
        <td>${escapeHtml(r.note||'')}</td>
        <td><button data-i="${i}" class="del">Delete</button></td>
      </tr>`;
    }).join('');

    logTable.querySelectorAll('.del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = +btn.dataset.i;
        const arr = loadLogs().sort((a,b)=>b.ts - a.ts);
        arr.splice(idx,1);
        saveLogs(arr);
        renderTable();
      });
    });
  }

  /* ---------- Actions ---------- */
  mcPlus.addEventListener('click', () => { saveCount(loadCount()+1); renderCount(); });
  mcMinus.addEventListener('click', () => { saveCount(loadCount()-1); renderCount(); });
  mcReset.addEventListener('click', () => {
    if (confirm('Reset match count to 0?')) { saveCount(0); renderCount(); }
  });

  qSave.addEventListener('click', () => {
    const entry = {
      ts: Date.now(),
      date: qDate.value || new Date().toISOString().slice(0,10),
      title: qTitle.value.trim() || null,
      skills: (qSkill.value||'').split(',').map(s=>s.trim()).filter(Boolean),
      focus: clampNum(qFocus.value, 0, 5),
      effort: clampNum(qEffort.value, 0, 5),
      perspective: clampNum(qPerspective.value, 0, 5),
      respect: clampNum(qRespect.value, 0, 5),
      note: qNote.value.trim() || null
    };
    const arr = loadLogs();
    arr.push(entry);
    saveLogs(arr);
    renderTable();
    // keep date; clear other inputs
    qTitle.value=''; qSkill.value=''; qNote.value='';
  });

  qClear.addEventListener('click', () => { qTitle.value=''; qSkill.value=''; qNote.value=''; });

  exCSV.addEventListener('click', () => {
    const rows = loadLogs().sort((a,b)=>a.ts - b.ts);
    const head = ['Date','Title','Focus','Effort','Perspective','Respect','Skills','Note'];
    const lines = [head].concat(rows.map(r => [
      r.date, r.title||'', r.focus??'', r.effort??'', r.perspective??'', r.respect??'',
      (r.skills||[]).join(' | '), (r.note||'').replace(/"/g,'""')
    ]));
    const csv = lines.map(cols => cols.map(c=>`"${c}"`).join(',')).join('\n');
    downloadBlob(csv, 'text/csv', 'athlete-live-log.csv');
  });

  exJSON.addEventListener('click', () => {
    downloadBlob(JSON.stringify(loadLogs(), null, 2), 'application/json', 'athlete-live-log.json');
  });

  /* ---------- Utils ---------- */
  function clampNum(v, min, max){
    const n = parseInt(v,10);
    if (Number.isNaN(n)) return null;
    return Math.min(max, Math.max(min, n));
  }
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function downloadBlob(text, type, filename){
    const blob = new Blob([text], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }

  // First paint
  renderCount();
  renderTable();

  console.log('[Athletes] Live Log ready (Match Count + FEPR + localStorage).');
})();
