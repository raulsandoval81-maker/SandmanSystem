// public/assets/js/parents-portal.js
// Parent Portal logic (local-first, Firebase-ready). Sports include Submission Grappling.

console.log("[Parent Portal] JS loaded");

// --- tiny LS helper ---
const LS = {
  get: (k, d=null) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch { return d; }
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

// ---- Demo seed (only if nothing present) ----
if (!LS.get("announcements")) {
  LS.set("announcements", [
    { id:"a1", ts: Date.now()-86400000*1, sport:"All", text:"Friday open mat 5–6PM. Bring water bottles." },
    { id:"a2", ts: Date.now()-86400000*4, sport:"All", text:"Welcome back! Fall session starts Monday." }
  ]);
}
if (!LS.get("schedule")) {
  LS.set("schedule", [
    { id:"w1", sport:"Wrestling", title:"Youth Wrestling",        sub:"Mon/Wed · 5:00–6:00 PM" },
    { id:"k1", sport:"Kickboxing", title:"Kickboxing All-levels", sub:"Tue/Thu · 6:00–7:15 PM" },
    { id:"g1", sport:"Submission Grappling", title:"Submission Grappling Fundamentals", sub:"Fri · 6:00–7:30 PM" }
  ]);
}
if (!LS.get("qa_items")) {
  LS.set("qa_items", []); // {id, name, email, text, ts, status, coachReply?}
}

// --- DOM refs ---
const annSport   = document.querySelector("#annSport");
const annReload  = document.querySelector("#annReload");
const annList    = document.querySelector("#annList");

const schedSport  = document.querySelector("#schedSport");
const schedReload = document.querySelector("#schedReload");
const schedList   = document.querySelector("#schedList");

const qName   = document.querySelector("#qName");
const qEmail  = document.querySelector("#qEmail");
const qText   = document.querySelector("#qText");
const askBtn  = document.querySelector("#askBtn");
const qStatus = document.querySelector("#qStatus");
const qaList  = document.querySelector("#qaList");

// --- renderers ---
function renderAnnouncements() {
  const all = LS.get("announcements", []);
  const sport = (annSport?.value || "all");
  const filtered = all
    .filter(a => sport === "all" || a.sport === sport || a.sport === "All")
    .sort((a,b)=>b.ts-a.ts);

  annList.innerHTML = filtered.length
    ? filtered.map(a => `
        <div class="item">
          <div class="muted" style="font-size:.85rem">${new Date(a.ts).toLocaleString()}</div>
          ${a.text}
        </div>
      `).join("")
    : `<div class="muted">No announcements yet.</div>`;
}

function renderSchedule() {
  const all = LS.get("schedule", []);
  const sport = (schedSport?.value || "all");
  const filtered = all.filter(s => sport === "all" || s.sport === sport);

  schedList.innerHTML = filtered.length
    ? filtered.map(s => `
        <div class="item">
          <div style="font-weight:700">${s.title}</div>
          <div class="muted">${s.sub}</div>
        </div>
      `).join("")
    : `<div class="muted">No classes yet for this sport.</div>`;
}

function renderQA() {
  const items = LS.get("qa_items", []).sort((a,b)=>b.ts-a.ts);
  qaList.innerHTML = items.length
    ? items.map(q => `
        <div class="item">
          <div class="muted" style="font-size:.85rem">${new Date(q.ts).toLocaleString()}</div>
          <div style="margin:4px 0">${q.text}</div>
          <div class="muted" style="font-size:.9rem">
            — ${q.name || "Anonymous"} ${q.email ? "· " + q.email : ""}
          </div>
          ${q.coachReply ? `<div style="margin-top:8px;padding:8px;border-radius:10px;background:#151b24">
            <div class="muted" style="font-size:.85rem">Coach reply</div>
            ${q.coachReply}
          </div>` : ""}
        </div>
      `).join("")
    : `<div class="muted">No questions yet.</div>`;
}

// --- actions ---
askBtn?.addEventListener("click", () => {
  const text = (qText?.value || "").trim();
  if (!text) { qStatus.textContent = "Please enter a question."; return; }

  const item = {
    id: crypto.randomUUID(),
    name: (qName?.value || "").trim(),
    email: (qEmail?.value || "").trim(),
    text,
    ts: Date.now(),
    status: "open"
  };
  const items = LS.get("qa_items", []);
  items.push(item);
  LS.set("qa_items", items);

  qText.value = "";
  qStatus.textContent = "Question sent (local mode).";
  renderQA();
});

// --- events ---
annSport?.addEventListener("change", renderAnnouncements);
annReload?.addEventListener("click", renderAnnouncements);

schedSport?.addEventListener("change", renderSchedule);
schedReload?.addEventListener("click", renderSchedule);

// initial render
renderAnnouncements();
renderSchedule();
renderQA();
