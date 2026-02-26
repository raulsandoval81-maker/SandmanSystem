// Parent Weekly — lightweight, defensive, no-Firebase (localStorage stub)
// Expects a page with (ids are optional; code is defensive):
// - <form id="parentWeeklyForm"> … </form>
// - <button id="saveWeekly">Save</button>
// - <button id="clearWeekly">Clear</button>
// - <button id="exportWeekly">Export CSV</button> (optional)
// - <div id="status">Ready.</div> (optional)

console.log("[Parent Weekly] loaded");

const $ = (id) => document.getElementById(id);
const form = $("parentWeeklyForm");
const saveBtn = $("saveWeekly");
const clearBtn = $("clearWeekly");
const exportBtn = $("exportWeekly");
const statusEl = $("status");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log("[Parent Weekly]", msg);
}

function serializeForm(frm) {
  const data = {};
  if (!frm) return data;
  const fields = frm.querySelectorAll("input, select, textarea");
  fields.forEach(el => {
    const key = el.name || el.id || null;
    if (!key) return;
    if (el.type === "checkbox") data[key] = !!el.checked;
    else if (el.type === "radio") { if (el.checked) data[key] = el.value; }
    else data[key] = el.value ?? "";
  });
  return data;
}

function getWeekKey(data) {
  // Use weekStart if present; fallback to today
  const raw = data.weekStart || data.date || new Date().toISOString().slice(0,10);
  return `parentWeekly:${raw}`;
}

function saveWeekly() {
  if (!form) { setStatus("No form found."); return; }
  const data = serializeForm(form);
  data._savedAt = new Date().toISOString();
  const key = getWeekKey(data);
  localStorage.setItem(key, JSON.stringify(data));
  setStatus(`Saved (${key}).`);
}

function clearWeekly() {
  if (!form) { setStatus("No form to clear."); return; }
  form.reset();
  setStatus("Cleared.");
}

function exportCSV() {
  // Export all parentWeekly:* entries
  const rows = [["key","field","value"]];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("parentWeekly:")) continue;
    try {
      const obj = JSON.parse(localStorage.getItem(k) || "{}");
      Object.keys(obj).forEach(field => {
        rows.push([k, field, String(obj[field] ?? "")]);
      });
    } catch {}
  }
  if (rows.length <= 1) { setStatus("Nothing to export."); return; }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parent-weekly-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("Exported CSV.");
}

// Wire events (defensive)
saveBtn && saveBtn.addEventListener("click", (e) => { e.preventDefault(); saveWeekly(); });
clearBtn && clearBtn.addEventListener("click", (e) => { e.preventDefault(); clearWeekly(); });
exportBtn && exportBtn.addEventListener("click", (e) => { e.preventDefault(); exportCSV(); });

setStatus("Ready.");
