import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireAdmin } from "/assets/js/admin-guard.js";

const el = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const label = (value) => clean(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function dateText(value) {
  if (!value) return "Not recorded";
  const millis = Number(value?._seconds ?? value?.seconds) * 1000 || Number(value) || Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

function staffList(items, empty) {
  return items?.length
    ? `<ul>${items.map((item) => `<li>${esc(item.name)} <small>· ${esc(label(item.role))}</small></li>`).join("")}</ul>`
    : `<p>${esc(empty)}</p>`;
}

function exceptionList(items) {
  return items?.length
    ? `<ul>${items.map((item) => `<li>${esc(item.label)} · ${Number(item.count || 0)}</li>`).join("")}</ul>`
    : "<p>No current operational exceptions.</p>";
}

function locationCard(location) {
  const exceptions = Number(location.exceptions?.count || 0);
  return `<article class="location-health">
    <header class="location-health__header"><div><h2>${esc(location.locationName)}</h2><p>${esc(location.locationId)}</p></div><span class="health-pill ${exceptions ? "is-attention" : "is-clear"}">${exceptions ? `${exceptions} attention` : "Clear"}</span></header>
    <div class="metric-grid">
      <div class="metric"><span>Inbox open</span><strong>${Number(location.inbox?.totalOpen || 0)}</strong><small>${Number(location.inbox?.escalated || 0)} escalated</small></div>
      <div class="metric"><span>Pipeline</span><strong>${Number(location.pipeline?.leads || 0) + Number(location.pipeline?.admissionsRequests || 0) + Number(location.pipeline?.appointments || 0) + Number(location.pipeline?.proposals || 0)}</strong><small>${Number(location.pipeline?.paidAwaitingIntake || 0)} paid awaiting intake</small></div>
      <div class="metric"><span>Members</span><strong>${Number(location.members?.total || 0)}</strong><small>${Number(location.members?.directAccessInactive || 0)} direct access inactive</small></div>
      <div class="metric"><span>Attendance</span><strong>${Number(location.attendance?.openPractices || 0)}</strong><small>${Number(location.attendance?.pendingReview || 0)} pending review</small></div>
      <div class="metric"><span>Schedule</span><strong>${esc(label(location.schedule?.status || "missing"))}</strong><small>${esc(dateText(location.schedule?.publishedAt || location.schedule?.updatedAt))}</small></div>
    </div>
    <div class="health-detail-grid">
      <section class="health-detail"><h3>Admissions &amp; Enrollment</h3><p>Leads: ${Number(location.pipeline?.leads || 0)} · Requests: ${Number(location.pipeline?.admissionsRequests || 0)}</p><p>Appointments: ${Number(location.pipeline?.appointments || 0)} · Proposals: ${Number(location.pipeline?.proposals || 0)}</p><p>Pending intakes: ${Number(location.pipeline?.pendingIntakes || 0)}</p></section>
      <section class="health-detail"><h3>Member Access</h3><p>Active: ${Number(location.members?.active || 0)} · Inactive: ${Number(location.members?.inactive || 0)}</p><p>Parent Managed: ${Number(location.members?.parentManaged || 0)} · Hybrid: ${Number(location.members?.hybrid || 0)} · Self Managed: ${Number(location.members?.selfManaged || 0)}</p></section>
      <section class="health-detail"><h3>Attendance</h3><p>Open practices: ${Number(location.attendance?.openPractices || 0)}</p><p>Finalized today: ${Number(location.attendance?.finalizedToday || 0)} · Recent: ${Number(location.attendance?.recentFinalized || 0)}</p></section>
      <section class="health-detail"><h3>Assigned Management</h3>${staffList(location.staffing?.management, "No active Management assigned.")}</section>
      <section class="health-detail"><h3>Assigned Coaches</h3>${staffList(location.staffing?.coaches, "No active Coach assigned.")}</section>
      <section class="health-detail"><h3>Exceptions</h3>${exceptionList(location.exceptions?.categories)}</section>
    </div>
  </article>`;
}

async function loadOversight() {
  const status = el("oversightStatus");
  const refresh = el("refreshOversight");
  refresh.disabled = true;
  status.textContent = "Loading read-only oversight summary…";
  status.classList.remove("is-error", "is-verified");
  try {
    const response = await httpsCallable(functions, "getAdminOversightSummary")({});
    const summary = response.data || {};
    el("locationOversight").innerHTML = Array.isArray(summary.locations) ? summary.locations.map(locationCard).join("") : "";
    const unknown = Number(summary.systemExceptions?.unknownLocationRecords || 0);
    el("systemExceptions").innerHTML = unknown
      ? `<div class="system-exceptions__notice"><strong>${unknown} record${unknown === 1 ? "" : "s"} require location review</strong><p>Missing or unknown location ownership was not assigned automatically.</p></div>`
      : "";
    status.textContent = `Summary refreshed ${new Date(Number(summary.generatedAt || Date.now())).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    status.classList.add("is-verified");
  } catch (error) {
    console.error("[admin-oversight] summary failed", error);
    status.textContent = error?.message || "Admin oversight could not be loaded.";
    status.classList.add("is-error");
  } finally {
    refresh.disabled = false;
  }
}

try {
  const admin = await requireAdmin();
  el("adminIdentity").textContent = admin.email ? `Active Admin · ${admin.email}` : "Active Admin";
  el("adminShell").hidden = false;
  el("refreshOversight").addEventListener("click", loadOversight);
  await loadOversight();
} catch (error) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    const returnUrl = encodeURIComponent(window.location.pathname);
    window.location.replace(`/admin/auth/login.html?returnUrl=${returnUrl}`);
  } else {
    console.error("[admin-oversight] access denied", error);
  }
}
