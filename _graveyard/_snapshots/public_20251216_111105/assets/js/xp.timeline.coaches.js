/* Coaches panel: pending assessments list with approve/decline */

(function () {
  const QUEUE_KEY = 'sandman:pending-assessment';
  const XP_ADJ_KEY = 'sandman:xp-adjustments';
  // fallback if not loaded yet from site.js
  const PROMO = window.PROMO || { DECAY_POINTS: 50, COOLDOWN_DAYS: 7 };

  function loadQueue() {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  }
  function saveQueue(list) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  }

  function render(list) {
    const root = document.getElementById('pending-assessments');
    if (!root) return;
    if (!list.length) { root.innerHTML = '<p>no pending assessments.</p>'; return; }
    root.innerHTML = list.map(req => `
      <div class="card" data-id="${req.id}">
        <h4>${req.athlete}</h4>
        <p>from <strong>${req.fromTier}</strong> → to <strong>${req.toTier || '-'}</strong></p>
        <p>xp at request: ${req.xpAtRequest}</p>
        <div class="actions">
          <button class="approve">approve</button>
          <button class="decline">decline</button>
        </div>
      </div>
    `).join('');
    root.querySelectorAll('.approve').forEach(b => b.onclick = () => decide(b, true));
    root.querySelectorAll('.decline').forEach(b => b.onclick = () => decide(b, false));
  }

  function decide(btn, ok) {
    const card = btn.closest('.card');
    const id = card?.dataset.id;
    if (!id) return;

    // remove from queue
    const list = loadQueue().filter(x => x.id !== id);
    saveQueue(list);

    if (ok) {
      // approval → promote now
      const desiredTier = card.querySelector('p strong:last-child')?.textContent || null;
      if (desiredTier) localStorage.setItem('currentTier', desiredTier);
      alert('approved');
    } else {
      // decline → apply decay + cooldown
      const existing = JSON.parse(localStorage.getItem(XP_ADJ_KEY) || 'null');
      const xpOffset = (existing?.xpOffset ?? 0) - PROMO.DECAY_POINTS;
      const cooldownUntil = new Date(Date.now() + PROMO.COOLDOWN_DAYS*24*60*60*1000).toISOString();
      localStorage.setItem(XP_ADJ_KEY, JSON.stringify({
        xpOffset,
        cooldownUntil,
        appliedAt: new Date().toISOString()
      }));
      alert(`declined (−${PROMO.DECAY_POINTS} xp, cooldown ${PROMO.COOLDOWN_DAYS}d)`);
    }

    card.remove();
    const root = document.getElementById('pending-assessments');
    if (root && !root.querySelector('.card')) root.innerHTML = '<p>no pending assessments.</p>';
  }

  document.addEventListener('DOMContentLoaded', () => render(loadQueue()));
})();
