// Coaches Weekly — local first (no Firebase yet), defensive bindings
console.log("[Coaches Weekly] loaded");

const $ = (id) => document.getElementById(id);
const form = $("coachWeeklyForm");
const saveBtn = $("saveWeekly");
const clearBtn = $("clearWeekly");
const exportBtn = $("exportWeekly");
const statusEl = $("status");

const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; console.log("[Coaches Weekly]", msg); };

const serializeForm = (frm) => {
  const data = {};
  if (!frm) return data;
  frm.querySelectorAll("input,select,textarea").forEach(el => {
    const key = el.name || el.id; if (!key) return;
    if (el.type === "checkbox") data[key] = !!el.checked;
    else if (el.type === "radio") { if (el.checked) data[key] = el.value; }
    else data[key] = el.value ?? "";
  });
  return data;
};

const weekKey = (data) => {
  const raw = data.weekStart || data.date || new Date().toISOString().slice(0,10);
  return `coachWeekly:${raw}`;
};

function saveWeekly() {
  if (!form) return setStatus("No form found.");
  const data = serializeForm(form);
  data._savedAt = new Date().toISOString();
  const key = weekKey(data);
  localStorage.setItem(key, JSON.stringify(data));
  setStatus(`Saved (${key}).`);
}

function clearWeekly() {
  if (!form) return setStatus("No form to clear.");
  form.reset();
  setStatus("Cleared.");
}

function exportCSV() {
  const rows = [["key","field","value"]];
  for (let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if (!k?.startsWith("coachWeekly:")) continue;
    try {
      const obj = JSON.parse(localStorage.getItem(k) || "{}");
      Object.keys(obj).forEach(f => rows.push([k,f,String(obj[f] ?? "")]));
    } catch {}
  }
  if (rows.length <= 1) return setStatus("Nothing to export.");
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `coach-weekly-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("Exported CSV.");
}

saveBtn && saveBtn.addEventListener("click", (e)=>{ e.preventDefault(); saveWeekly(); });
clearBtn && clearBtn.addEventListener("click", (e)=>{ e.preventDefault(); clearWeekly(); });
exportBtn && exportBtn.addEventListener("click", (e)=>{ e.preventDefault(); exportCSV(); });

setStatus("Ready.");
