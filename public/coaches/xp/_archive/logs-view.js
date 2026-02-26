/* =========================================================
   FRONTEND (Coach view) — “Explain XP 30 days later”
   Query last 30 days of xpLogs for a single athlete.
   File: /coaches/xp/logs-view.js (or wherever)
   ========================================================= */

import { db, collection, query, where, orderBy, limit, getDocs, Timestamp } from "/assets/js/firebase-init.js";

export async function loadAthleteXpLogs30(athleteId) {
  const since = Timestamp.fromMillis(Date.now() - (30 * 24 * 60 * 60 * 1000));

  const q = query(
    collection(db, "xpLogs"),
    where("athleteId", "==", athleteId),
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc"),
    limit(200)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Minimal render example:
export function renderLogs(el, logs) {
  if (!logs.length) {
    el.innerHTML = `<div class="muted">No XP logs in last 30 days.</div>`;
    return;
  }

  el.innerHTML = logs.map(x => {
    const dt = x.createdAt?.toDate ? x.createdAt.toDate() : new Date(x.createdAtMs || Date.now());
    const when = dt.toLocaleString();
    const sign = x.delta > 0 ? "+" : "";
    const domain = x.meta?.domain || "GYM";
    const reason = x.meta?.reasonLabel || x.meta?.reasonCode || "";
    const note = x.meta?.reasonNote ? ` — ${x.meta.reasonNote}` : "";

    return `
      <div class="log-row">
        <div><b>${sign}${x.delta}</b> <span class="muted">(${x.lane})</span> <span class="muted">[${domain}]</span></div>
        <div class="muted">${when} · ${reason}${note}</div>
        <div class="muted">Coach: ${x.coachUid}</div>
      </div>
    `;
  }).join("");
}
