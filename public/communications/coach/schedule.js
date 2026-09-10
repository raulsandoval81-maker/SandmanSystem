import { db } from "/assets/js/firebase-init.js";
import { requireCoach, coachLoginUrl, isCoachAuthenticationError } from "/assets/js/coach-guard.js";
import { filterScheduleForAthlete, loadPublishedLocationSchedule, normalizeLocationId, scheduleCategoryLabel, scheduleProviderLabel } from "/assets/js/location-schedule.js";

const dailyList = document.getElementById("daily-list");
const monthlyList = document.getElementById("monthly-list");
const statusEl = document.getElementById("status");
const accessEl = document.getElementById("coach-schedule-access");
const accessMessageEl = document.getElementById("coach-schedule-access-message");
const contentEl = document.getElementById("coach-schedule-content");
const controls = ["btn-add-daily", "btn-add-monthly", "btn-save-all"];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function render(schedule) {
  const visible = filterScheduleForAthlete(schedule);
  dailyList.innerHTML = visible.weekly.length ? visible.weekly.map((row) => `<div class="row-card"><div class="row-grid"><div class="field"><span class="label">Day</span><strong>${esc(row.day || "—")}</strong></div><div class="field"><span class="label">Class</span><strong>${esc(row.title || "—")}</strong></div><div class="field"><span class="label">Time</span><strong>${esc(row.label || row.time || "—")}</strong></div><div class="field"><span class="label">Category</span><strong>${esc(scheduleCategoryLabel(row))}</strong></div><div class="field"><span class="label">Provider</span><strong>${esc(scheduleProviderLabel(row))}</strong></div><div class="field"><span class="label">Instructor</span><strong>${esc(row.instructor || "—")}</strong></div><div class="field"><span class="label">Details</span><span>${esc(row.details || "—")}</span></div></div></div>`).join("") : `<div class="row-card">No schedule has been published for this location.</div>`;
  monthlyList.innerHTML = visible.events.length ? visible.events.map((event) => `<div class="row-card"><strong>${esc(event.title || "—")}</strong><p>${esc(event.date || "")} ${esc(event.location || "")}</p><p>${esc(event.details || "")}</p></div>`).join("") : `<div class="row-card">No upcoming events have been published.</div>`;
  statusEl.textContent = schedule.status === "published" ? `Published schedule — ${schedule.locationName}` : `No published schedule — ${schedule.locationName}`;
}

async function start() {
  const access = await requireCoach();
  console.info("[coach-schedule] safe access diagnostic:", access.diagnostic);
  controls.forEach((id) => { const element = document.getElementById(id); if (element) element.hidden = true; });
  const bannerAdmin = document.querySelector(".banner-admin");
  if (bannerAdmin) bannerAdmin.hidden = true;
  const requested = normalizeLocationId(new URLSearchParams(location.search).get("locationId"));
  const assigned = access.scope?.locationIds || [];
  const locationId = access.isSystemAdmin && requested ? requested : requested && assigned.includes(requested) ? requested : assigned[0];
  if (!locationId) throw new Error("No Coach location is assigned.");
  render(await loadPublishedLocationSchedule(db, locationId));
  accessEl.hidden = true;
  contentEl.hidden = false;
}

start().catch((error) => {
  console.error("[coach-schedule] load failed", error);
  console.info("[coach-schedule] safe access diagnostic:", error?.diagnostic || { authenticated: false });
  if (isCoachAuthenticationError(error)) {
    location.replace(coachLoginUrl());
    return;
  }
  accessMessageEl.textContent = error.message || "Coach schedule unavailable.";
  accessEl.hidden = false;
  contentEl.hidden = true;
});
