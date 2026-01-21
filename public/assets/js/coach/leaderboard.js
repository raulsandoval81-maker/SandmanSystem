// public/assets/js/leaderboard.js
// ---------------------------------
// Leaderboard (Firestore)
// ---------------------------------
import { db } from "../firebase-init.js";
import { collection, query, where, orderBy, getDocs } 
  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---- DOM hooks
const coachViewChk = document.getElementById("coachViewChk");   // optional checkbox
const coachTools   = document.getElementById("coachTools");     // optional tools panel
const tableHost    = document.getElementById("lbTableHost");    // <div> where the table is injected

// local cache so we can re-render without requerying
let cachedRows = [];

// ---- UI helpers
function applyCoachUI() {
  if (coachTools) {
    coachTools.style.display = coachViewChk?.checked ? "flex" : "none";
  }
}

// Safe table render (no poking into thead.rows)
function renderTable(rows) {
  cachedRows = rows.slice(); // keep a copy for re-rendering on toggle

  const showCoachId = !!coachViewChk?.checked;

  const html = `
    <table class="lb">
      <thead>
        <tr>
          <th>${showCoachId ? "ID" : "Rank"}</th>
          <th>Athlete</th>
          <th>Total XP</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r, i) => {
            const leftCol = showCoachId ? (r.id ?? "") : `${i + 1}.`;
            return `
              <tr>
                <td>${leftCol}</td>
                <td>${r.name}</td>
                <td>${r.total}</td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;

  if (tableHost) tableHost.innerHTML = html;
}

// ---- Firestore load
async function loadLeaderboard({ status = "approved" } = {}) {
  // xp_logs with status filter + dateKey desc (uses the index you created)
  const xpRef = collection(db, "xp_logs");
  const q = query(
    xpRef,
    where("status", "==", status),
    orderBy("dateKey", "desc")
  );

  const snap = await getDocs(q);

  // aggregate total XP per athlete
  const totals = new Map();
  const idsByAthlete = new Map();

  snap.forEach((doc) => {
    const d = doc.data() || {};
    const name =
      d.athlete ??
      d.athleteLower ??
      "unknown";
    const pts = Number(d.points ?? 0);

    totals.set(name, (totals.get(name) || 0) + pts);

    // keep one example doc id per athlete for "coach view"
    if (!idsByAthlete.has(name)) idsByAthlete.set(name, doc.id);
  });

  // to array + sort by total desc
  const rows = Array.from(totals.entries())
    .map(([name, total]) => ({
      id: idsByAthlete.get(name),
      name,
      total,
    }))
    .sort((a, b) => b.total - a.total);

  renderTable(rows);
  applyCoachUI();
}

// ---- wire events
if (coachViewChk) {
  coachViewChk.addEventListener("change", () => {
    applyCoachUI();
    // re-render current data so header/first column updates instantly
    renderTable(cachedRows);
  });
}

// ---- boot
(async () => {
  try {
    await loadLeaderboard();
  } catch (err) {
    console.error("[Leaderboard] load failed:", err);
    if (tableHost) {
      tableHost.innerHTML =
        `<p class="muted">Failed to load leaderboard. Check console for details.</p>`;
    }
  }
})();
