import { db } from "/assets/js/firebase-init.js";
import { resolveSignedInAthlete } from "/assets/js/athlete-dashboard-data.js";
import { expandScheduleRowsByDay, filterScheduleForAthlete, loadPublishedLocationSchedule, resolveScheduleLocation, scheduleCategoryLabel, scheduleProviderLabel } from "/assets/js/location-schedule.js";
import { nextScheduledSession, resolveLocationScheduleLiveState } from "/assets/js/location-schedule-live-state.js";

const todayBox = document.getElementById("today-box");
const dailyEl = document.getElementById("daily-schedule");
const tourEl = document.getElementById("tournament-schedule");
const bannerEl = document.getElementById("coach-banner");
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const displayTime = (row = {}) => row.label || row.time || (row.start && row.end ? `${row.start} - ${row.end}` : "—");
const meta = (row) => `${scheduleCategoryLabel(row)} • ${scheduleProviderLabel(row)} • ${row.instructor || "Instructor TBA"}`;

function render(schedule, athlete) {
  const visible = filterScheduleForAthlete(schedule, athlete);
  const live = resolveLocationScheduleLiveState(visible.weekly, new Date(), schedule.timezone);
  const later = live.state === "complete" ? nextScheduledSession(visible.weekly, new Date(), schedule.timezone) : null;
  const weeklyRows = expandScheduleRowsByDay(visible.weekly);

  if (bannerEl) bannerEl.innerHTML = visible.banner?.active ? `<div class="coach-banner">${esc(visible.banner.text || "")}</div>` : "";
  const stateClass = `schedule-state--${live.state}`;
  const stateTitle = live.state === "active" ? "ACTIVE NOW" : live.state === "next" ? "NEXT SESSION" : live.state === "complete" ? "TODAY COMPLETE" : "NO SESSION TODAY";
  const stateDetail = live.row ? `<div class="item-title">${esc(live.row.title)}</div><div class="item-time">${esc(displayTime(live.row))}</div>${live.state === "next" ? `<div class="item-sub">Starts in ${live.minutesUntil} min</div>` : ""}` : later ? `<div class="item-sub">Next: ${esc(later.row.title)} — ${esc(later.day)} ${esc(displayTime(later.row))}</div>` : `<div class="item-sub">No scheduled session today.</div>`;
  todayBox.className = `today-box ${stateClass}`;
  todayBox.innerHTML = `<div class="item"><div class="item-day">${stateTitle}</div>${stateDetail}</div>${live.todayRows.map((row) => `<div class="item schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")}"><div class="item-top"><div class="item-day">${esc(row.title)}</div><div class="item-time">${esc(displayTime(row))}</div></div><div class="item-sub">${esc(row.details || "")}</div><div class="item-sub">${esc(meta(row))}</div></div>`).join("")}`;
  dailyEl.innerHTML = weeklyRows.length ? weeklyRows.map((row) => `<div class="item schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")}"><div class="item-top"><div class="item-day">${esc(row.day || "—")}</div><div class="item-time">${esc(displayTime(row))}</div></div><div class="item-title">${esc(row.title || "—")}</div><div class="item-sub">${esc(row.details || "")}</div><div class="item-sub">${esc(meta(row))}</div></div>`).join("") : `<div class="item"><div class="item-sub">No weekly schedule published for this location.</div></div>`;
  tourEl.innerHTML = visible.events.length ? visible.events.map((event) => `<div class="item"><div class="item-top"><div class="item-day">${esc(event.title || "—")}</div><div class="item-time">${esc(event.date || "—")}</div></div><div class="item-sub">${esc(event.location || "")}</div><div class="item-sub">${esc(event.details || "")}</div></div>`).join("") : `<div class="item"><div class="item-sub">No upcoming events published.</div></div>`;
}

async function start() {
  const requestedId = new URLSearchParams(location.search).get("id") || "";
  const context = await resolveSignedInAthlete(requestedId);
  if (!context?.athleteId || !context?.athlete) throw new Error("Athlete access required.");
  const locationId = resolveScheduleLocation(context.athlete);
  if (!locationId) throw new Error("Your athlete profile does not have an assigned location.");
  render(await loadPublishedLocationSchedule(db, locationId), context.athlete);
}

start().catch((error) => {
  console.error("[athlete-schedule] load failed", error);
  todayBox.innerHTML = `<div class="item"><div class="item-sub">${esc(error.message || "Schedule unavailable.")}</div></div>`;
  dailyEl.innerHTML = "";
  tourEl.innerHTML = "";
});
