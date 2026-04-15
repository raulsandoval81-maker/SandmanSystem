/* ============================================================
   LIVE BRACKET BOARD (2026)
   ============================================================ */

export function renderStandings(list, el) {
  el.innerHTML = "";

  list.forEach((a, i) => {
    el.innerHTML += `
      <div class="rr-row">
        <span class="place">${i + 1}</span>
        <span class="name">${a.name}</span>
        <span class="team">${a.team}</span>
        <span class="wl">${a.wins}-${a.losses}</span>
        <span class="pts">${a.pointsFor}</span>
        <span class="diff">${a.pointsFor - a.pointsAgainst}</span>
        <span class="pins">${a.pins}</span>
      </div>
    `;
  });
}
