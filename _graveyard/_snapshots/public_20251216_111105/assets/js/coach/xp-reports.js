// coach/xp-reports.js
console.log("[XP Reports] loaded");

// Grab table + status
const rowsEl = document.getElementById("xp-rows");
const statusEl = document.getElementById("status");

function renderXPReports(data = []) {
  if (!rowsEl) return;
  rowsEl.innerHTML = data.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${r.track}</td>
      <td>${r.xp}</td>
      <td>${r.updated}</td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="muted">No XP reports yet.</td></tr>`;
}

// Placeholder data (replace with Firestore later)
document.addEventListener("DOMContentLoaded", () => {
  statusEl.textContent = "XP Reports placeholder active.";
  renderXPReports([
    { name:"Max S.", track:"Foundry 8", xp:120, updated:"10/29" },
    { name:"Curran K.", track:"Foundry 4", xp:200, updated:"10/29" }
  ]);
});
