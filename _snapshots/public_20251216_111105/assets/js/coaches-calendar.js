// coaches-calendar.js — 20% shell (no Firebase). Week view + localStorage.

const $ = (id) => document.getElementById(id);
const calendar = $('calendar');
const statusEl = $('status');
const addBtn = $('addEventBtn');

const STORAGE_KEY = 'coachCalendarEvents:v1'; // [{id, date:'YYYY-MM-DD', title, type}]
let events = loadEvents();

// === Date helpers ===
function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();           // 0=Sun..6=Sat
  x.setDate(x.getDate() - day);     // back to Sunday
  x.setHours(0,0,0,0);
  return x;
}
function fmtYMD(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function nice(d) {
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

// === Storage ===
function loadEvents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// === Render ===
function renderWeek(start = startOfWeek()) {
  calendar.innerHTML = ''; // 7 columns (Sun..Sat)
  for (let i = 0; i < 7; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const key = fmtYMD(day);

    const cell = document.createElement('div');
    cell.className = 'day';
    cell.dataset.date = key;
    cell.innerHTML = `<strong>${day.toLocaleDateString(undefined, { weekday:'short' })}</strong><br/><span class="muter">${nice(day)}</span>`;

    // events for this day
    const dayEvents = events.filter(e => e.date === key);
    dayEvents.forEach(e => {
      const tag = document.createElement('div');
      tag.className = 'event';
      tag.textContent = e.title || '(Untitled)';
      tag.title = `[${e.type || 'Event'}] ${e.title}`;
      cell.appendChild(tag);
    });

    // click to add event for that day
    cell.addEventListener('click', () => addEventForDate(key));

    calendar.appendChild(cell);
  }
  setStatus(`Week of ${nice(start)} — ${events.length} total event${events.length!==1?'s':''}.`);
}

// === Actions ===
function addEventForDate(dateYMD) {
  const title = prompt(`Add event on ${dateYMD}\nTitle:`);
  if (!title) return;
  const type = prompt('Type (Practice / Tournament / Meeting):', 'Practice') || 'Event';
  events.push({ id: crypto.randomUUID(), date: dateYMD, title: title.trim(), type: type.trim() });
  saveEvents();
  renderWeek(startOfWeek());
}

addBtn?.addEventListener('click', () => {
  // Quick-add via prompts (lets you pick any date)
  const date = prompt('Date (YYYY-MM-DD):', fmtYMD(new Date()));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setStatus('Add canceled.'); return; }
  addEventForDate(date);
});

// Status helper
function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

// Boot
renderWeek(startOfWeek());
setStatus('Ready.');
