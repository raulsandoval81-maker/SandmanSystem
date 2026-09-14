import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { managementLoginUrl, requireManagement } from "/management/shared/guards/management-guard.js";

const el = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function millis(value) {
  if (!value) return 0;
  return Number(value?._seconds ?? value?.seconds) * 1000 || Date.parse(value) || 0;
}

function dayLabel(session) {
  const time = millis(session.finalizedAt || session.updatedAt || session.openedAt);
  return time ? new Date(time).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "Date unavailable";
}

function grouped(items, key, value) {
  return items.reduce((result, item) => {
    const label = key(item);
    result.set(label, (result.get(label) || 0) + value(item));
    return result;
  }, new Map());
}

function renderBreakdown(id, entries, emptyText) {
  el(id).innerHTML = entries.length ? entries.map(([label, count]) => `<div class="breakdown-row"><span>${esc(label)}</span><strong>${Number(count)}</strong></div>`).join("") : `<p class="empty-state">${emptyText}</p>`;
}

async function start() {
  const context = await requireManagement();
  el("reportsScope").textContent = context.isSystemAdmin ? "All authorized locations" : (context.scope?.locationIds || []).join(", ") || "No location scope assigned";
  const response = await httpsCallable(functions, "listManagementAttendance")({});
  const sessions = Array.isArray(response.data?.sessions) ? response.data.sessions : [];
  const finalized = sessions.filter((item) => item.status === "finalized");
  const pending = sessions.filter((item) => item.status === "pending_review");
  el("finalizedTotal").textContent = String(finalized.length);
  el("participationTotal").textContent = String(finalized.reduce((sum, item) => sum + Number(item.presentCount || 0), 0));
  el("pendingTotal").textContent = String(pending.length);
  renderBreakdown("dailyBreakdown", [...grouped(finalized, dayLabel, (item) => Number(item.presentCount || 0)).entries()], "No finalized attendance to report.");
  renderBreakdown("disciplineBreakdown", [...grouped(finalized, (item) => clean(item.discipline) || "Unspecified", (item) => Number(item.presentCount || 0)).entries()].sort((a, b) => b[1] - a[1]), "No discipline participation to report.");
  renderBreakdown("recentFinalized", finalized.slice(0, 12).map((item) => [`${dayLabel(item)} · ${clean(item.discipline) || "Practice"} · ${clean(item.roomId) || "No room"}`, Number(item.presentCount || 0)]), "No recent finalized sessions.");
  el("reportsStatus").textContent = `${finalized.length} finalized session${finalized.length === 1 ? "" : "s"} included.`;
}

start().catch((error) => {
  console.error("[management-reports] load failed", error);
  el("reportsStatus").textContent = error?.message || "Reports could not be loaded.";
  el("reportsStatus").classList.add("is-error");
  if (!auth.currentUser || auth.currentUser.isAnonymous) window.setTimeout(() => window.location.replace(managementLoginUrl()), 1200);
});
