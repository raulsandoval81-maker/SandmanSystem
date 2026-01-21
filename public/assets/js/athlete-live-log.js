// public/assets/js/athlete-live-log.js
// Demo local storage wiring for Athletes Corner → Live Log
console.log('[Athlete Portal] JS loaded');

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const resultEl = $('result');
const preEl = $('pre');
const postEl = $('post');
const saveBtn = $('saveLog');
const historyEl = $('history');

const STORE_KEY = 'ac_live_logs:v1';

function getLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}
function setLogs(arr) {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function renderHistory() {
  const logs = getLogs().sort((a, b) => b.ts - a.ts);

  if (!historyEl) return;

  if (!logs.length) {
    historyEl.textContent = 'No logs yet.';
    return;
  }

  const wins = logs.filter(l => l.result === 'Win').length;
  const losses = logs.filter(l => l.result === 'Loss').length;

  const parts = [];
  parts.push(`<div style="margin-bottom:8px;"><strong>Record:</strong> ${wins}-${losses} • <strong>Total Matches:</strong> ${logs.length}</div>`);

  logs.forEach((l, i) => {
    parts.push(`
      <div style="border:1px solid #2a3648; border-radius:10px; padding:10px; margin:8px 0; background:#0f141b;">
        <div style="display:flex; justify-content:space-between; gap:8px;">
          <div><strong>${l.result || '—'}</strong></div>
          <div style="color:#9fb0c8;">${formatTime(l.ts)}</div>
        </div>
        ${l.pre ? `<div style="margin-top:6px;"><em>Pre:</em> ${escapeHtml(l.pre)}</div>` : ''}
        ${l.post ? `<div style="margin-top:4px;"><em>Post:</em> ${escapeHtml(l.post)}</div>` : ''}
      </div>
    `);
  });

  historyEl.innerHTML = parts.join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function onSave() {
  const res = resultEl?.value?.trim();
  const pre = preEl?.value?.trim();
  const post = postEl?.value?.trim();

  if (!res) {
    setStatus('Pick Win or Loss before saving.');
    resultEl?.focus();
    return;
  }

  const logs = getLogs();
  logs.push({
    ts: Date.now(),
    result: res,
    pre,
    post,
  });
  setLogs(logs);

  // Quick reset for next entry
  preEl && (preEl.value = '');
  postEl && (postEl.value = '');
  resultEl && (resultEl.selectedIndex = 0);

  setStatus('Saved ✓');
  renderHistory();
}

// -- wire up
document.addEventListener('DOMContentLoaded', () => {
  saveBtn?.addEventListener('click', onSave);
  renderHistory();
  setStatus('Ready.');
});
