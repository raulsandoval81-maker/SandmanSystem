/* ============================================================
   DIRECTOR LIVE SYNC (2026)
   ============================================================ */

import { renderStandings } from "./RRLiveBoard.js";

export function watchPool(eventId, poolId, el) {

  return db.collection("events")
    .doc(eventId)
    .collection("pools")
    .doc(poolId)
    .onSnapshot(doc => {

      const data = doc.data();
      if (!data) return;

      const standings = data.standings || [];
      renderStandings(standings, el);
    });
}
