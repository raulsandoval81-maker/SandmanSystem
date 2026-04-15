// public/admin/xp-master-log.service.js
// READ-ONLY — admin guard first, then Firestore query

import { requireAdmin } from "/assets/js/admin-guard.js";
import { db } from "/assets/js/firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

(async function () {
  const tableBody = document.querySelector("#xpTable tbody");
  const rowCountEl = document.getElementById("rowCount");
  const statusEl = document.getElementById("status");

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#ff8a8a" : "";
  }

  function setRowCount(n) {
    if (rowCountEl) rowCountEl.textContent = String(n);
  }

  function formatDate(ts) {
    if (!ts) return "—";

    try {
      if (typeof ts.toDate === "function") {
        return ts.toDate().toLocaleString();
      }
      if (ts.seconds) {
        return new Date(ts.seconds * 1000).toLocaleString();
      }
      return new Date(ts).toLocaleString();
    } catch {
      return "—";
    }
  }

  function lanePill(lane) {
    const safeLane = String(lane || "").toLowerCase();
    const cls = safeLane || "combat";
    const label = safeLane ? safeLane.toUpperCase() : "—";
    return `<span class="pill ${cls}">${label}</span>`;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderRow(log) {
    const amount = Number(log.amount || 0);
    return `
      <tr>
        <td>${esc(formatDate(log.createdAt))}</td>
        <td class="mono">${esc(log.uid || "—")}</td>
        <td>${lanePill(log.lane || "")}</td>
        <td>${esc(log.kind || "—")}</td>
        <td>${amount > 0 ? "+" : ""}${esc(amount)}</td>
        <td>${esc(log.meta?.source || log.meta?.note || "—")}</td>
        <td>${esc(log.coachUid || "—")}</td>
        <td class="mono">${esc(log.eventId || "—")}</td>
      </tr>
    `;
  }

  async function loadLogs() {
    try {
      setStatus("Checking admin access...");
      setRowCount(0);

      await requireAdmin();

      setStatus("Loading logs...");

      const q = query(
        collection(db, "xpLogs"),
        orderBy("createdAt", "desc"),
        limit(100)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        tableBody.innerHTML = `<tr><td colspan="8" class="muted">No logs found.</td></tr>`;
        setRowCount(0);
        setStatus("No logs.");
        return;
      }

      const logs = snap.docs.map((d) => d.data());
      tableBody.innerHTML = logs.map(renderRow).join("");
      setRowCount(logs.length);
      setStatus(`Loaded ${logs.length} logs.`);
    } catch (err) {
      console.error("[xp-master-log] load failed:", err);
      tableBody.innerHTML = `<tr><td colspan="8" class="muted">Error loading logs.</td></tr>`;
      setRowCount(0);
      setStatus(err?.message || "Error.", true);
    }
  }

  document.getElementById("btnRefresh")?.addEventListener("click", async () => {
    await loadLogs();
  });

  await loadLogs();
})();