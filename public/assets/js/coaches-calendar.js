import { db } from "/assets/js/firebase-init.js";
import { requireCoach, coachLoginUrl } from "/assets/js/coach-guard.js";
import { loadPublishedLocationSchedule, normalizeLocationId, scheduleCategoryLabel, scheduleProviderLabel } from "/assets/js/location-schedule.js";

const calendar = document.getElementById("calendar");
const status = document.getElementById("status");
const addEventBtn = document.getElementById("addEventBtn");
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function render(schedule) {
  calendar.innerHTML = days.map((day) => {
    const rows = schedule.weekly.filter((row) => String(row.day || "").toLowerCase().includes(day.toLowerCase()));
    return `<div class="day"><strong>${esc(day.slice(0, 3))}</strong>${rows.map((row) => `<div class="event">${esc(row.title || "Session")}<br>${esc(row.label || row.time || "")}<br>${esc(scheduleCategoryLabel(row))} • ${esc(scheduleProviderLabel(row))}<br>${esc(row.instructor || "Instructor TBA")}</div>`).join("")}</div>`;
  }).join("");
  status.textContent = schedule.status === "published" ? `Published schedule — ${schedule.locationName}` : `No published schedule — ${schedule.locationName}`;
  if (addEventBtn) addEventBtn.hidden = true;
}

async function start() {
  const access = await requireCoach();
  const requested = normalizeLocationId(new URLSearchParams(location.search).get("locationId"));
  const assigned = access.scope?.locationIds || [];
  const locationId = access.isSystemAdmin && requested ? requested : requested && assigned.includes(requested) ? requested : assigned[0];
  if (!locationId) throw new Error("No Coach location is assigned.");
  render(await loadPublishedLocationSchedule(db, locationId));
}

start().catch((error) => {
  console.error("[coach-calendar] load failed", error);
  status.textContent = error.message || "Schedule unavailable.";
  if (/authentication|required|profile|access/i.test(error.message || "")) setTimeout(() => location.assign(coachLoginUrl()), 1200);
});
