// coach/roster.js
console.log("[Roster] coach tool loaded");

const $ = id => document.getElementById(id);
const rowsEl = $("roster-rows");
const statusEl = $("status");

function renderRoster(data = []) {
  if (!rowsEl) return;
  rowsEl.innerHTML = data.map(a => `
    <tr>
      <td>${a.name}</td>
      <td>${a.track}</td>
      <td>${a.city || "—"}</td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="muted">No athletes yet.</td></tr>`;
}

// Placeholder data
document.addEventListener("DOMContentLoaded", () => {
  statusEl.textContent = "Roster placeholder active.";
  renderRoster([
    { name:"Max S.", track:"Foundry 8", city:"Lompoc" },
    { name:"Curran K.", track:"Foundry 4", city:"Santa Ynez" }
  ]);
});
