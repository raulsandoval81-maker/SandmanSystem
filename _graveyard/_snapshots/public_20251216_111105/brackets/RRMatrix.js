/* ============================================================
   ROUND ROBIN MATCH MATRIX GENERATOR (2026)
   ============================================================ */

export function buildRRMatrix(athletes) {
  const list = [...athletes];
  const matches = [];

  // Full round robin
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      matches.push(new RRMatch(list[i].id, list[j].id));
    }
  }

  return matches;
}
