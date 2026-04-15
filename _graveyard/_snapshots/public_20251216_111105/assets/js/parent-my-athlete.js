// public/assets/js/parent-my-athlete.js
// Snapshot view (local sample)

console.log("[Parent • My Athlete] JS loaded");

const LS = {
  get: (k, d=null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

// seed demo athletes if none
if (!LS.get("athletes_demo")) {
  LS.set("athletes_demo", [
    { id:"a1", name:"Jordan S.", sport:"Wrestling",            xp:120, logs:8,  updated: Date.now()-3600e3*12 },
    { id:"a2", name:"Maya L.",   sport:"Kickboxing",           xp:95,  logs:5,  updated: Date.now()-3600e3*24 },
    { id:"a3", name:"Kade R.",   sport:"Submission Grappling", xp:140, logs:11, updated: Date.now()-3600e3*3  },
    { id:"a4", name:"Nova T.",   sport:"Strength",             xp:60,  logs:3,  updated: Date.now()-3600e3*72 }
  ]);
}

const sportSel = document.querySelector("#sportSel");
const athleteSel = document.querySelector("#athleteSelect");
const snap = document.querySelector("#snap");

function loadAthletesForSport(sport) {
  const all = LS.get("athletes_demo", []);
  return all.filter(a => a.sport === sport);
}

function refreshAthleteOptions() {
  const sport = sportSel.value;
  const list = loadAthletesForSport(sport);
  athleteSel.innerHTML = list.length
    ? list.map(a => `<option value="${a.id}">${a.name}</option>`).join("")
    : `<option disabled>No athletes yet</option>`;
  renderSnapshot();
}

function renderSnapshot() {
  const sport = sportSel.value;
  const all = loadAthletesForSport(sport);
  const current = all.find(a => a.id === athleteSel.value) || all[0];
  if (!current) { snap.innerHTML = "XP: 0<br/>Logs: 0<br/>Updated: —"; return; }

  snap.innerHTML = `XP: ${current.xp}<br/>Logs: ${current.logs}<br/>Updated: ${new Date(current.updated).toLocaleString()}`;
}

sportSel?.addEventListener("change", refreshAthleteOptions);
athleteSel?.addEventListener("change", renderSnapshot);

// kick off
refreshAthleteOptions();
