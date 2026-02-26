// Minimal fake data; replace with Firestore query later.
const sampleAthletes = [
  { uid: "u1", name: "Max R.", tier: "T1 Recruit", monthXp: 90 },
  { uid: "u2", name: "Curran S.", tier: "T1 Recruit", monthXp: 110 },
  { uid: "u3", name: "Ruby M.", tier: "T0 Shadow", monthXp: 40 }
];

function renderRoster(listEl, athletes) {
  listEl.innerHTML = athletes.map(a => `
    <div class="ath">
      <input type="checkbox" data-uid="${a.uid}" />
      <div>
        <div><strong>${a.name}</strong> <span class="pill">${a.tier}</span></div>
        <div class="muted">XP this month: ${a.monthXp} / 240</div>
      </div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const rosterList = document.getElementById("rosterList");
  renderRoster(rosterList, sampleAthletes);

  document.getElementById("markAll")?.addEventListener("click", () => {
    rosterList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  document.getElementById("clearAll")?.addEventListener("click", () => {
    rosterList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  document.getElementById("saveAttendance")?.addEventListener("click", async () => {
    const marked = Array.from(rosterList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.getAttribute("data-uid"));
    // Later: call incrementXp({ type:"attendance", uids: marked, xp:10 })
    console.log("Attendance present +10:", marked);
    alert(`Saved attendance for ${marked.length} athletes (+10 XP each).`);
  });

  document.getElementById("savePlan")?.addEventListener("click", () => {
    const payload = {
      onMat: document.getElementById("onMat").value.trim(),
      warmup: document.getElementById("warmup").value.trim(),
      reviewOld: document.getElementById("reviewOld").value.trim(),
      newTech: document.getElementById("newTech").value.trim(),
      conditioning: document.getElementById("conditioning").value.trim(),
      live: document.getElementById("live").value.trim(),
      offMat: document.getElementById("offMat").value.trim(),
      savedAt: new Date().toISOString()
    };
    console.log("Practice plan saved:", payload);
    alert("Practice notes saved (local stub).");
  });
});
