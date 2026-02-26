function renderXP() {
  const logDiv = document.getElementById("xp-log");
  logDiv.innerHTML = "";

  const totals = XP.totalsByAthlete();
  for (const [athlete, xp] of Object.entries(totals)) {
    const p = document.createElement("p");
    p.textContent = `${athlete}: ${xp} XP`;
    logDiv.appendChild(p);
  }
}
