// /public/assets/js/tools-index.js
const grid = document.getElementById('toolsGrid');

const tools = [
  { name:'Open Hub',         href:'./hub.html',              phase:'ready',  blurb:'Central workspace & quick links.' },
  { name:'New Athlete Intake', href:'./intake.html',         phase:'ready',  blurb:'Create profiles & auto-start logs.' },
  { name:'Athlete Tracker',  href:'./athlete.html',          phase:'beta',   blurb:'Profile, skills, XP timeline, logs.' },
  { name:'Ceremonies',       href:'./ceremonies.html',       phase:'beta',   blurb:'Plan rankings, run scripts.' },
  { name:'Q&A',              href:'./qa.html',               phase:'ready',  blurb:'Ask/browse coaching questions.' },
  { name:'Practice Plan Builder', href:'./practice-plans.html', phase:'placeholder', blurb:'Design sessions (placeholder).' },
  { name:'Curriculum Notes', href:'./curriculum.html',       phase:'placeholder', blurb:'Attach lesson notes (placeholder).' },
  { name:'Coach Video Notes',href:'./video-notes.html',      phase:'placeholder', blurb:'Clip/link reviews (placeholder).' },
  { name:'XP Reports',       href:'./xp.reports.html',       phase:'placeholder', blurb:'Charts/exports (placeholder).' },
  { name:'Printable Exports',href:'./exports.html',          phase:'placeholder', blurb:'CSV/PDF one-click (placeholder).' },
  { name:'Notifications',    href:'./notifications.html',    phase:'placeholder', blurb:'Banners/alerts (placeholder).' },
  { name:'Tournament Prep',  href:'./tournament.html',       phase:'placeholder', blurb:'Checklists & day-of flow.' },
];

const phaseBadge = (p) =>
  `<span class="pill ${p}">${p.toUpperCase()}</span>`;

const card = (t) => `
  <a class="tool" href="${t.href}">
    <div class="tool-head">
      <h3>${t.name}</h3>
      ${phaseBadge(t.phase)}
    </div>
    <p>${t.blurb}</p>
  </a>`;

grid.innerHTML = tools.map(card).join('');
console.log('[Tools] grid ready:', tools.length, 'items');
