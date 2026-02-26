// xp.timeline.v2.js
import { app, db } from '/assets/js/firebase-init.js';
import { collection, query, orderBy, limit, getDocs } 
  from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

// ----------------- Timeline -----------------
async function renderTimeline() {
  const statusEl = document.getElementById('tl-status');
  const listEl = document.getElementById('tl-list');

  try {
    const q = query(
      collection(db, 'xp_logs'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      statusEl.textContent = 'No XP logs yet.';
      return;
    }

    statusEl.textContent = '';
    snap.forEach(docu => {
      const x = docu.data();
      const li = document.createElement('li');
      li.textContent = `${x.athleteId || 'unknown'} – ${x.category}: ${x.points} XP`;
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error('Timeline load failed:', err);
    statusEl.textContent = `Error: ${err.message}`;
  }
}

// ----------------- Ladder -----------------
function renderLadderSnippet(name) {
  const box = document.getElementById('ladderBox');
  if (!box) return;

  // Example XP tier cutoffs (Youth ladder – adjust as needed)
  const tiers = [0, 200, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];

  // TODO: replace with real XP total for this athlete
  const xpTotal = 750;  

  // Build track
  const track = document.createElement('div');
  track.className = 'ladder-track';

  tiers.forEach(t => {
    const seg = document.createElement('div');
    seg.className = 'ladder-seg';
    if (xpTotal >= t) seg.classList.add('done');
    track.appendChild(seg);
  });

  // Gold pin
  const pin = document.createElement('div');
  pin.className = 'ladder-pin';
  pin.style.left = `${(xpTotal / tiers[tiers.length - 1]) * 100}%`;
  track.appendChild(pin);

  // Labels
  const labels = document.createElement('div');
  labels.className = 'ladder-labels';
  labels.textContent = `Now: ${xpTotal} XP • Next: ${tiers.find(t => t > xpTotal) || 'MAX'}`;

  // Replace
  box.innerHTML = '';
  box.appendChild(track);
  box.appendChild(labels);
}

// ----------------- Boot -----------------
document.addEventListener('DOMContentLoaded', () => {
  renderTimeline();              // load XP timeline
  renderLadderSnippet('');       // baseline ladder so box isn’t empty
});
