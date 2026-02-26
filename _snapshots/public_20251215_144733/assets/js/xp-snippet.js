// Renders the compact ladder view (“snippet”) anywhere.
// Depends on ladder.service.js for math.
import { getStripeInfo } from './ladder.service.js';

/**
 * @param {string} elId           - container id (e.g., "ladderSnippet")
 * @param {Array<Object>} ladder  - LADDER_YOUTH or LADDER_F4
 * @param {number} totalXP        - athlete's total xp
 * @param {string} href           - link to full ladder page
 */
export function renderLadderSnippet(elId, ladder, totalXP = 0, href = '/athletes/ladder.html') {
  const el = document.getElementById(elId);
  if (!el) return;

  const { tier, stripesEarned, stripesTotal, nextTier, toNextTier } =
    getStripeInfo(ladder, Number(totalXP) || 0);

  const nextLine = nextTier
    ? `Next: ${nextTier.name} (need ${toNextTier} XP)`
    : `Next: — (Max tier)`;

  el.innerHTML = `
    <div><strong>Tier:</strong> ${tier.name}</div>
    <div><strong>Stripes:</strong> ${stripesEarned}/${stripesTotal}</div>
    <div>${nextLine}</div>
    <div style="margin-top:.5rem;">
      <a class="chip" href="${href}">View full ladder map →</a>
    </div>
  `;
}
