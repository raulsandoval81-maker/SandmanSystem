// Parent Weekly Archive — reads localStorage and lists entries
// Expects a container: <div id="archiveList"></div> (optional)

console.log("[Parent Weekly Archive] loaded");

const listEl = document.getElementById("archiveList");
const statusEl = document.getElementById("status");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log("[Parent Weekly Archive]", msg);
}

function loadArchive() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("parentWeekly:")) {
      try {
        const data = JSON.parse(localStorage.getItem(k) || "{}");
        items.push({ key: k, data });
      } catch {}
    }
  }
  items.sort((a,b) => a.key.localeCompare(b.key)); // chronological if keys are dates
  render(items);
}

function render(items) {
  if (!listEl) { setStatus(`Found ${items.length} entries.`); return; }
  if (!items.length) { listEl.innerHTML = "<p>No archived weekly entries.</p>"; return; }
  const html = items.map(({key, data}) => {
    const nice = Object.entries(data)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k,v]) => `<div><strong>${k}:</strong> ${String(v ?? "")}</div>`).join("");
    return `<div class="card" style="background:#0f141b;color:#e8eef7;border:1px solid #263244;border-radius:12px;padding:12px;margin:10px 0;">
      <div style="font-weight:800;color:#ffd633;margin-bottom:6px;">${key.replace("parentWeekly:","Week ")}</div>
      ${nice || "<em>(no fields)</em>"}
    </div>`;
  }).join("");
  listEl.innerHTML = html;
}

loadArchive();
setStatus("Archive loaded.");
