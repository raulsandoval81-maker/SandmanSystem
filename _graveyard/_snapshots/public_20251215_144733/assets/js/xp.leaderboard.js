// public/assets/js/xp.leaderboard.js
// Coach tools: Leaderboard + bulk XP awards + CSV export (later)

// --- Imports from our firebase-init.js (re-exported helpers) ---
import {
  db,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "./firebase-init.js";

// --- Helpers & constants ---
const XP_COLL   = () => collection(db, "xp_logs");
const ATHL_COLL = () => collection(db, "athletes");

// tiny DOM helpers
const el  = (id) => document.getElementById(id);
const on  = (id, evt, fn) => { const n = el(id); if (n) n.addEventListener(evt, fn); };

const YOUTH_RANKS  = ["Shadow","Recruit","Combatant","Competitor","Warrior","Champion","Commander","Sandman","Legend"];
const ADULT_RANKS  = ["White","Blue","Purple","Brown","Black"];
const COLORS       = ["White","Gray","Blue","Purple","Brown","Black","Gold Stripe"];
const CATS         = ["Technique","Competition Day","Discipline","Conditioning","Leadership","Attendance","Extra Merit","Decay"];

// --- State ---
const state = {
  rows: [],                     // [{ id,name,program,rank,color,logs,total }]
  selected: new Set(),          // names for quick demo selection
  filters: { days: 30, program: "", rank: "", color: "", q: "" },
};

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[XP] xp.leaderboard.js loaded");

  // populate filters
  fillOptions(el("rankSelect"), ["", ...YOUTH_RANKS, ...ADULT_RANKS], "Any rank");
  fillOptions(el("colorSelect"), ["", ...COLORS], "Any color");
  fillOptions(el("bulkCategorySelect"), CATS);

  // events
  on("timeSelect", "change", onFilterChange);
  on("programSelect", "change", onFilterChange);
  on("rankSelect", "change", onFilterChange);
  on("colorSelect", "change", onFilterChange);
  on("searchInput", "input", onFilterChange);
  on("reloadBtn", "click", loadAll);

  on("masterChk", "change", onMasterToggle);
  on("selectAllBtn", "click", selectAllVisible);
  on("invertSelBtn", "click", invertSelection);
  on("clearSelBtn", "click", clearSelection);

  on("bulkAddBtn", "click", bulkAddXP);

  // quickXP buttons (if you add them later)
  [...document.querySelectorAll(".quickXP")].forEach(b =>
    b.addEventListener("click", () => {
      el("bulkPointsInput").value = b.dataset.xp;
    })
  );

  // load once on page load
  loadAll();

  // auto-refresh every 30 seconds
  setInterval(loadAll, 30000);
});

// --- UI helpers ---
function fillOptions(selectEl, items, firstLabel = null) {
  if (!selectEl) return;
  const opts = [];
  if (firstLabel !== null) opts.push(`<option value="">${firstLabel}</option>`);
  for (const val of items) opts.push(`<option value="${val}">${val || "—"}</option>`);
  selectEl.innerHTML = opts.join("");
}

function onFilterChange() {
  state.filters.days    = +(el("timeSelect")?.value || 30);
  state.filters.program = el("programSelect")?.value || "";
  state.filters.rank    = el("rankSelect")?.value || "";
  state.filters.color   = el("colorSelect")?.value || "";
  state.filters.q       = (el("searchInput")?.value || "").trim().toLowerCase();
  applyFiltersAndRender();
}

function onMasterToggle() {
  const master = el("masterChk")?.checked;
  const names  = [...document.querySelectorAll('tbody#leaderTableBody input[type="checkbox"]')].map(i => i.dataset.name);
  if (master) names.forEach(n => state.selected.add(n)); else state.selected.clear();
  renderTable(state.rows);
}
function selectAllVisible() {
  [...document.querySelectorAll('tbody#leaderTableBody input[type="checkbox"]')].forEach(i => state.selected.add(i.dataset.name));
  renderTable(state.rows);
}
function invertSelection() {
  [...document.querySelectorAll('tbody#leaderTableBody input[type="checkbox"]')].forEach(i => {
    const n = i.dataset.name;
    if (state.selected.has(n)) state.selected.delete(n); else state.selected.add(n);
  });
  renderTable(state.rows);
}
function clearSelection() {
  state.selected.clear();
  renderTable(state.rows);
}

// --- Data load & render ---
async function loadAll() {
  // 1) Load athletes (sorted by name for consistent table)
  const snap = await getDocs(query(ATHL_COLL(), orderBy("name"), limit(500)));
  const athletes = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

  // 2) For this phase, total/logs are placeholder (0) unless already stored on the doc
  //    Later we can aggregate xp_logs per athlete over the date window.
  const rows = athletes.map(a => ({
    id: a.id,
    name: a.name || "(no name)",
    program: (a.program || "").toLowerCase(),
    rank: a.rank || "",
    color: a.color || "",
    logs: a.logs ?? 0,
    total: a.total ?? 0,
  }));

  state.rows = rows.sort((a,b) => a.name.localeCompare(b.name));
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  let rows = [...state.rows];
  const { program, rank, color, q } = state.filters;

  if (program) rows = rows.filter(r => (r.program || "") === program);
  if (rank)    rows = rows.filter(r => (r.rank || "")    === rank);
  if (color)   rows = rows.filter(r => (r.color || "")   === color);
  if (q)       rows = rows.filter(r => (r.name || "").toLowerCase().includes(q));

  renderTable(rows);
}

function renderTable(rows) {
  const body = el("leaderTableBody");
  if (!body) return;
  body.innerHTML = rows.map((r, i) => {
    const checked = state.selected.has(r.name) ? "checked" : "";
    const rankColor = [r.rank, r.color].filter(Boolean).join(" • ");
    return `
      <tr class="${checked ? "selected": ""}">
        <td><input type="checkbox" data-name="${escapeHtml(r.name)}" ${checked}></td>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${escapeHtml(r.program || "—")}</td>
        <td>${escapeHtml(r.rank || "—")}</td>
        <td>${escapeHtml(r.color || "—")}</td>
        <td class="right">${r.logs ?? 0}</td>
        <td class="right"><strong>${r.total ?? 0}</strong></td>
      </tr>
    `;
  }).join("");

  // row checkbox handlers (re-bind after redraw)
  [...body.querySelectorAll('input[type="checkbox"]')].forEach(chk => {
    chk.addEventListener("change", () => {
      const n = chk.dataset.name;
      if (chk.checked) state.selected.add(n); else state.selected.delete(n);
    });
  });
}

// --- Bulk add XP (Phase-38 lite; extend later with category, notes, etc.) ---
async function bulkAddXP() {
  const names = [...state.selected];
  if (!names.length) return alert("Select at least one athlete.");
  const pts = +(el("bulkPointsInput")?.value || 0);
  const cat = el("bulkCategorySelect")?.value || "Technique";
  if (!pts) return alert("Enter XP points to add.");

  // Write one XP log per selected athlete
  const when = serverTimestamp();
  for (const name of names) {
    await addDoc(XP_COLL(), { name, xp: pts, category: cat, createdAt: when });
  }
  alert(`Added ${pts} XP (${cat}) to ${names.length} athlete(s).`);

  // (Later: recompute totals from xp_logs; for now just clear selection)
  state.selected.clear();
  el("bulkPointsInput").value = "";
}

// --- utils ---
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
