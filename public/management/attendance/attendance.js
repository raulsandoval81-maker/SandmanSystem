import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { managementLoginUrl, requireManagement } from "/management/shared/guards/management-guard.js";

const el = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function dateText(value) {
  if (!value) return "Not recorded";
  const millis = Number(value?._seconds ?? value?.seconds) * 1000 || Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

function athleteList(items, emptyText) {
  if (!items?.length) return `<p class="muted">${emptyText}</p>`;
  return `<ul class="athlete-list">${items.map((item) => `<li><strong>${esc(item.name || item.id)}</strong><small>${esc(item.id)}${item.checkedInAt ? ` · ${esc(dateText(item.checkedInAt))}` : ""}</small></li>`).join("")}</ul>`;
}

function card(session) {
  const status = clean(session.status || "open").toLowerCase();
  const count = status === "finalized" ? session.presentCount : session.checkedInCount;
  const removed = (session.removedIds || []).map((id) => ({ id, name: id }));
  return `<details class="session-card">
    <summary>
      <span class="session-title"><strong>${esc(session.discipline || "Practice")}</strong><span>${esc(session.practiceId)}</span></span>
      <span class="session-fact"><strong>${esc(session.roomId || "—")}</strong><span>Room</span></span>
      <span class="session-fact"><strong>${esc(session.coach || "—")}</strong><span>Coach</span></span>
      <span class="session-fact"><strong>${esc(dateText(session.openedAt))}</strong><span>Opened</span></span>
      <span class="session-fact"><strong>${Number(count || 0)}</strong><span>${status === "finalized" ? "Present" : "Checked in"}</span></span>
      <span class="status-pill is-${esc(status)}">${esc(status.replaceAll("_", " "))}</span>
    </summary>
    <div class="session-detail"><div class="detail-grid">
      <section class="detail-panel"><h3>Checked In</h3>${athleteList(session.checkedIn, "No check-ins recorded.")}</section>
      <section class="detail-panel"><h3>Finalized Present</h3>${athleteList(session.present, "Not finalized yet.")}</section>
      <section class="detail-panel"><h3>Removed / Corrected</h3>${athleteList(removed, "No removals recorded.")}</section>
    </div></div>
  </details>`;
}

function renderGroup(id, countId, sessions, emptyText) {
  el(countId).textContent = String(sessions.length);
  el(id).innerHTML = sessions.length ? sessions.map(card).join("") : `<p class="empty-state">${emptyText}</p>`;
}

async function start() {
  const context = await requireManagement();
  const locations = context.isSystemAdmin ? "All authorized locations" : (context.scope?.locationIds || []).join(", ");
  el("attendanceScope").textContent = locations || "No location scope assigned";
  const response = await httpsCallable(functions, "listManagementAttendance")({});
  const sessions = Array.isArray(response.data?.sessions) ? response.data.sessions : [];
  renderGroup("openSessions", "openCount", sessions.filter((item) => item.practiceStatus === "active" && !["pending_review", "finalized"].includes(item.status)), "No open practices at your location.");
  renderGroup("pendingSessions", "pendingCount", sessions.filter((item) => item.status === "pending_review"), "No attendance sessions are awaiting Coach review.");
  renderGroup("finalizedSessions", "finalizedCount", sessions.filter((item) => item.status === "finalized"), "No recent finalized attendance sessions.");
  el("attendanceStatus").textContent = `${sessions.length} location-scoped attendance session${sessions.length === 1 ? "" : "s"} loaded.`;
}

start().catch((error) => {
  console.error("[management-attendance] load failed", error);
  el("attendanceStatus").textContent = error?.message || "Attendance could not be loaded.";
  el("attendanceStatus").classList.add("is-error");
  if (!auth.currentUser || auth.currentUser.isAnonymous) window.setTimeout(() => window.location.replace(managementLoginUrl()), 1200);
});
