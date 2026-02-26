const sheet = document.getElementById("sheet");
const addBtn = document.getElementById("addRow");
const saveCsvBtn = document.getElementById("saveCsv");
const printBtn = document.getElementById("print");
const clearBtn = document.getElementById("clearAll");
const autosave = document.getElementById("autosave");
const when = document.getElementById("when");
when.textContent = new Date().toLocaleString();

const KEY = "meeting_signin_rows_v1";

function makeRow(data = {}) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.innerHTML = `
    <input placeholder="Parent / Padre" value="${escape(data.parent||"")}">
    <input placeholder="Athlete / Atleta" value="${escape(data.athlete||"")}">
    <input placeholder="Phone / Teléfono" value="${escape(data.phone||"")}">
    <input placeholder="Email / Correo" value="${escape(data.email||"")}">
    <input placeholder="Notes / Notas" value="${escape(data.notes||"")}">
    <div class="x"><button class="rm" title="Remove">×</button></div>
  `;
  // listeners
  wrap.querySelector(".rm").addEventListener("click", () => {
    wrap.remove();
    persist();
  });
  wrap.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("change", persist);
    inp.addEventListener("input", () => { if (autosave.checked) persist(); });
  });
  sheet.appendChild(wrap);
}

function addN(n=1){ for (let i=0;i<n;i++) makeRow(); }

function readRows() {
  const rows = [];
  sheet.querySelectorAll(".row").forEach((r,i)=>{
    if (i===0) return; // skip header
    const inputs = r.querySelectorAll("input");
    rows.push({
      parent: inputs[0].value.trim(),
      athlete: inputs[1].value.trim(),
      phone: inputs[2].value.trim(),
      email: inputs[3].value.trim(),
      notes: inputs[4].value.trim(),
    });
  });
  return rows.filter(r => Object.values(r).some(v => v));
}

function persist() {
  if (!autosave.checked) return;
  localStorage.setItem(KEY, JSON.stringify(readRows()));
}

function restore() {
  const raw = localStorage.getItem(KEY);
  if (!raw){ addN(8); return; }
  const rows = JSON.parse(raw);
  if (!rows.length) { addN(8); return; }
  rows.forEach(r => makeRow(r));
}

function toCSV(rows) {
  const header = ["Parent","Athlete","Phone","Email","Notes"];
  const esc = (s)=> `"${String(s||"").replace(/"/g,'""')}"`;
  const lines = [header.map(esc).join(",")];
  rows.forEach(r => lines.push([r.parent,r.athlete,r.phone,r.email,r.notes].map(esc).join(",")));
  return lines.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  URL.revokeObjectURL(url); a.remove();
}

function escape(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// events
addBtn.addEventListener("click", ()=> makeRow());
saveCsvBtn.addEventListener("click", ()=>{
  const rows = readRows();
  const csv = toCSV(rows);
  const ts = new Date().toISOString().slice(0,10);
  download(`lompoc-wrestling-signin-${ts}.csv`, csv);
});
printBtn.addEventListener("click", ()=> window.print());
clearBtn.addEventListener("click", ()=>{
  if (!confirm("Clear all rows saved on this device?")) return;
  localStorage.removeItem(KEY);
  // remove all rows except header
  sheet.querySelectorAll(".row").forEach((r,i)=>{ if(i>0) r.remove(); });
  addN(8);
});

restore();
