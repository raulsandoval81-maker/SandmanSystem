// Coaches Weekly Archive — list coachWeekly:* from localStorage
console.log("[Coaches Weekly Archive] loaded");

const listEl = document.getElementById("archiveList");
const statusEl = document.getElementById("status");
const setStatus = (m)=>{ if (statusEl) statusEl.textContent = m; console.log("[CWA]", m); };

function load() {
  const items = [];
  for (let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if (!k?.startsWith("coachWeekly:")) continue;
    try { items.push({ key:k, data: JSON.parse(localStorage.getItem(k) || "{}") }); } catch {}
  }
  items.sort((a,b)=>a.key.localeCompare(b.key));
  render(items);
}

function render(items){
  if (!listEl){ return setStatus(`Found ${items.length} entries.`); }
  if (!items.length){ listEl.innerHTML = "<p>No archived weekly entries.</p>"; return; }
  listEl.innerHTML = items.map(({key,data})=>{
    const fields = Object.entries(data)
      .filter(([k])=>!k.startsWith("_"))
      .map(([k,v])=>`<div><strong>${k}:</strong> ${String(v ?? "")}</div>`).join("");
    return `<div class="card" style="background:#0f141b;color:#e8eef7;border:1px solid #263244;border-radius:12px;padding:12px;margin:10px 0;">
      <div style="font-weight:800;color:#ffd633;margin-bottom:6px;">${key.replace("coachWeekly:","Week ")}</div>
      ${fields || "<em>(no fields)</em>"}
    </div>`;
  }).join("");
}

load();
setStatus("Archive loaded.");
