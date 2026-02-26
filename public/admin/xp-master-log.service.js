// xp-master-log.service.js
// V1 RULE: READ-ONLY. NO SIDE EFFECTS.

(async function () {
  const tableBody = document.querySelector("#xpTable tbody");

  // Placeholder fetch — wire to Firestore later
  async function fetchXpLogs() {
    /*
      Expected shape (future):
      {
        timestamp,
        athleteName,
        lane: "combat" | "strength" | "honor",
        type: "show" | "win" | "style" | "attendance" | "behavior",
        delta,
        reason,
        coach,
        eventId
      }
    */
    return [
      {
        timestamp: "2026-02-05 06:12",
        athleteName: "Max S.",
        lane: "combat",
        type: "Show",
        delta: +10,
        reason: "Weekend tournament",
        coach: "Coach Sandoval",
        eventId: "EVT-9021"
      }
    ];
  }

  function lanePill(lane) {
    return `<span class="pill ${lane}">${lane.toUpperCase()}</span>`;
  }

  function renderRow(log) {
    return `
      <tr>
        <td>${log.timestamp}</td>
        <td>${log.athleteName}</td>
        <td>${lanePill(log.lane)}</td>
        <td>${log.type}</td>
        <td>${log.delta > 0 ? "+" : ""}${log.delta}</td>
        <td>${log.reason}</td>
        <td>${log.coach}</td>
        <td>${log.eventId || "—"}</td>
      </tr>
    `;
  }

  const logs = await fetchXpLogs();
  tableBody.innerHTML = logs.map(renderRow).join("");
})();
