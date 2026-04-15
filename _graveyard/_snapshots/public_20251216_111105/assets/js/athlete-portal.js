// Athlete Portal – local-first with easy switch to Firebase later.
console.log("[Athlete Portal] JS loaded");

// ---------- simple data adapter ----------
const useFirebase = false;            // flip to true later
const LS = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

// seed demo leaderboard if empty (local mode)
function seedDemo() {
  if (!LS.get("lb_rows")) {
    LS.set("lb_rows", [
      { name:"max", program:"youth", color:"White", rank:"Shadow", logs:2, xp:120 },
      { name:"raul", program:"adult", color:"Blue", rank:"Warrior", logs:4, xp:260 },
      { name:"maximus", program:"youth", color:"White", rank:"Recruit", logs:1, xp:70 }
    ]);
  }
  if (!LS.get("tips")) {
    LS.set("tips", [
      "Win the stance: knees bent, chin down, hands ready.",
      "One perfect rep beats ten sloppy ones.",
      "Breathe between exchanges; exhale on contact."
    ]);
  }
  if (!LS.get("my_logs")) LS.set("my_logs", []);
}
seedDemo();

// ---------- DOM ----------
const modeBadge   = document.getElementById("modeBadge");
const sportSel    = document.getElementById("sportSel");
const programSel  = document.getElementById("programSel");
const searchName  = document.getElementById("searchName");
const reloadBtn   = document.getElementById("reloadBtn");
const lbStatus    = document.getElementById("lbStatus");
const lbTable     = document.getElementById("lbTable");
const tipsList    = document.getElementById("tipsList");

const logMood     = document.getElementById("logMood");
const logEffort   = document.getElementById("logEffort");
const logLearned  = document.getElementById("logLearned");
const logNext     = document.getElementById("logNext");
const saveLogBtn  = document.getElementById("saveLogBtn");
const logStatus   = document.getElementById("logStatus");
const logsList    = document.getElementById("logsList");

modeBadge.textContent = useFirebase ? "Firebase mode" : "Local mode";

// ---------- Leaderboard ----------
function loadLeaderboard() {
  lbStatus.textContent = "Loading…";
  let rows = LS.get("lb_rows", []);
  const q = (searchName.value || "").trim().toLowerCase();
  if (programSel.value) rows = rows.filter(r => r.program === programSel.value);
  if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q));

  // render
  lbTable.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
    <th>#</th><th>Athlete</th><th>Program</th><th>Rank / Color</th><th>Logs</th><th>XP</th>
  </tr>`;
  const tbody = document.createElement("tbody");
  rows.forEach((r,i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.program}</td>
      <td><span class="badge">${r.rank} / ${r.color}</span></td>
      <td>${r.logs ?? 0}</td>
      <td>${r.xp ?? 0}</td>`;
    tbody.appendChild(tr);
  });
  lbTable.append(thead, tbody);
  lbStatus.textContent = rows.length ? `${rows.length} athletes` : "No athletes yet.";
}
reloadBtn.addEventListener("click", loadLeaderboard);
searchName.addEventListener("input", () => loadLeaderboard());
programSel.addEventListener("change", () => loadLeaderboard());
loadLeaderboard();

// ---------- Tips ----------
function renderTips() {
  const tips = LS.get("tips", []);
  tipsList.innerHTML = "";
  if (!tips.length) { tipsList.textContent = "No tips yet."; return; }
  tips.forEach(t => {
    const p = document.createElement("div");
    p.textContent = "• " + t;
    tipsList.appendChild(p);
  });
}
renderTips();

// ---------- Athlete Logs ----------
function renderLogs() {
  const logs = LS.get("my_logs", []);
  logsList.innerHTML = "";
  if (!logs.length) { logsList.textContent = "No logs yet."; return; }
  logs.slice().reverse().forEach(l => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="muted" style="margin-bottom:6px">${new Date(l.ts).toLocaleString()}</div>
      <div><b>Mood:</b> ${l.mood || "-"}</div>
      <div><b>Effort:</b> ${l.effort || "-"}</div>
      <div style="margin-top:8px"><b>Learned:</b><br>${escapeHtml(l.learned || "")}</div>
      <div style="margin-top:8px"><b>Next:</b><br>${escapeHtml(l.next || "")}</div>`;
    logsList.appendChild(div);
  });
}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))}

saveLogBtn.addEventListener("click", () => {
  const entry = {
    mood: logMood.value,
    effort: logEffort.value,
    learned: (logLearned.value || "").trim(),
    next: (logNext.value || "").trim(),
    ts: Date.now()
  };
  if (!entry.learned && !entry.next) { logStatus.textContent = "Add a note first."; return; }
  const logs = LS.get("my_logs", []); logs.push(entry); LS.set("my_logs", logs);
  logMood.value = ""; logEffort.value = ""; logLearned.value = ""; logNext.value = "";
  logStatus.textContent = "Saved.";
  // also increment demo logs count for "max" so the leaderboard moves a bit
  const rows = LS.get("lb_rows", []); if (rows[0]) { rows[0].logs = (rows[0].logs||0)+1; LS.set("lb_rows", rows); }
  renderLogs(); loadLeaderboard();
});
renderLogs();
window.showAthlete = async function(uid){
  const a = await DB.get('athletes', uid);
  if (!a) return;
  const put = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };

  put('ath-tier', `${a.tier} · ${a.track === 'foundry8' ? 'Apprentice' : 'Path'}`);
  put('ath-xp', a.xp ?? 0);
  put('ath-gate', a.compGate ?? 800);
  document.getElementById('ath-meter')?.style?.setProperty('width', `${Math.min(100, (a.xp||0)/(a.compGate||800)*100)}%`);
};

// Auto-load when tab opens (if session already set)
document.addEventListener('DOMContentLoaded', () => {
  if (window.SESSION?.currentAthleteUid) {
    window.showAthlete(window.SESSION.currentAthleteUid);
  }
});
