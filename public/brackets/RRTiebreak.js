/* ============================================================
   NFHS TIEBREAKERS (2026)
   ============================================================ */

export function applyTiebreakers(list) {

  return list.sort((a, b) => {

    // 1 — wins
    if (a.wins !== b.wins) return b.wins - a.wins;

    // 2 — head-to-head
    const aBeatB = a.matchResults[b.id];
    const bBeatA = b.matchResults[a.id];
    if (aBeatB && bBeatA) {
      if (aBeatB.for > aBeatB.against) return -1; 
      if (bBeatA.for > bBeatA.against) return 1;  
    }

    // 3 — most pins
    if (a.pins !== b.pins) return b.pins - a.pins;

    // 4 — most techs
    if (a.techs !== b.techs) return b.techs - a.techs;

    // 5 — point differential
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffA !== diffB) return diffB - diffA;

    // 6 — most points scored
    if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;

    // 7 — fewest points allowed
    if (a.pointsAgainst !== b.pointsAgainst) return a.pointsAgainst - b.pointsAgainst;

    // 8 — random (coin flip)
    return Math.random() > 0.5 ? 1 : -1;
  });
}
