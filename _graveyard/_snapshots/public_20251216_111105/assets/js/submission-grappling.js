// Submission Grappling page wiring (local mode)
// -------------------------------------------------
const SPORT = "Submission Grappling";
const KEYS  = { xp: "xp_entries" };

const $  = s => document.querySelector(s);
const read  = (k, f = []) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const push  = (k, v) => { const a = read(k, []); a.unshift(v); write(k, a); return a; };

function setStatus(msg){
  const el = $('#sgStatus');
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => (el.textContent = ''), 2500);
}

// ---- XP add (local) ----
function addXP(points, category){
  const name = ($('#sgName')?.value || '').trim();
  if (!name){ setStatus('Enter your name first.'); return; }
  const row = { name, sport: SPORT, category, points, ts: Date.now() };
  push(KEYS.xp, row);
  setStatus(`+${points} XP · ${category}`);
  renderRecent();
}

// ---- Recent entries (for this sport, optional filtered by name) ----
function renderRecent(){
  const box = $('#sgRecent'); if (!box) return;
  const name = ($('#sgName')?.value || '').trim();
  const rows = read(KEYS.xp, [])
    .filter(r => r.sport === SPORT && (!name || (r.name||'').trim() === name))
    .slice(0, 10);

  box.innerHTML = rows.length
    ? rows.map(r => `<li><span class="timestamp">${new Date(r.ts).toLocaleString()}</span> +${r.points} <em>${r.category}</em></li>`).join('')
    : '<li class="muted">No entries yet.</li>';
}

// ---- Page content (lists) ----
const TECH = {
  Fundamentals: [
    "Base, stance, safe breakfalls",
    "Hip escape & bridge chain",
    "Frames + guard retention (hip shield, knee shield)",
    "Mount, side control & back survival",
    "Stand up in base / technical get-up"
  ],
  TopGame: [
    "Pressure passing: knee cut, over-under",
    "Side control → mount transitions",
    "Back control: seatbelt + hooks"
  ],
  BottomGame: [
    "Closed/open guard: scissor & hip-bump sweeps",
    "Half-guard: underhook come-up",
    "Shrimp → invert to recover guard"
  ],
  Submissions: [
    "Rear naked choke",
    "Basic guillotine (with safety)",
    "Armbar from guard",
    "Triangle setup basics",
    "Kimura from top/bottom"
  ],
  PositionalRounds: [
    "Start in mount (escape vs hold)",
    "Start in back control (escape vs finish)",
    "Guard pass vs retention",
    "Turtle go-live (coach whistle swap)"
  ],
  Safety: [
    "Tap early, partner releases immediately.",
    "No neck cranks / spine locks / heel hooks (youth).",
    "Control first, submit second — coach stop = stop.",
    "Hygiene: clean gear, nails clipped, cover cuts."
  ]
};

function renderLists(){
  const map = [
    ['#sgFundamentals','Fundamentals'],
    ['#sgTop','TopGame'],
    ['#sgBottom','BottomGame'],
    ['#sgSubs','Submissions'],
    ['#sgPositional','PositionalRounds'],
    ['#sgSafety','Safety']
  ];
  map.forEach(([sel, key])=>{
    const el = $(sel); if (!el) return;
    el.innerHTML = TECH[key].map(x => `<li>${x}</li>`).join('');
  });
}

// ---- Quick XP buttons ----
function bindQuickButtons(){
  document.querySelectorAll('[data-xp]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pts = Number(btn.dataset.xp || 0);
      const cat = btn.dataset.cat || 'Drill';
      addXP(pts, cat);
    });
  });
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', ()=>{
  renderLists();
  bindQuickButtons();
  renderRecent();
  $('#sgName')?.addEventListener('input', renderRecent);
});

// Optional global (only if you want to call from inline HTML)
window.sgAddXP = addXP;
