import { db } from "/assets/js/firebase-init.js";
import { resolveSignedInAthlete } from "/assets/js/athlete-dashboard-data.js";
import { filterScheduleForAthlete, loadPublishedLocationSchedule, resolveScheduleLocation } from "/assets/js/location-schedule.js";

const todayBox = document.getElementById("today-box");
const dailyEl = document.getElementById("daily-schedule");
const tourEl = document.getElementById("tournament-schedule");
const bannerEl = document.getElementById("coach-banner");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const displayTime = (row = {}) => row.label || row.time || (row.start && row.end ? `${row.start} - ${row.end}` : "—");

function render(schedule, athlete) {
  const visible = filterScheduleForAthlete(schedule, athlete);
  const today = DAYS[new Date().getDay()];
  const todayRows = visible.weekly.filter((row) => String(row.day || "").toLowerCase().includes(today.toLowerCase()));

  if (bannerEl) bannerEl.innerHTML = visible.banner?.active ? `<div class="coach-banner">${esc(visible.banner.text || "")}</div>` : "";
  todayBox.innerHTML = todayRows.length ? todayRows.map((row) => `<div class="item"><div class="item-top"><div class="item-day">${esc(today)}</div><div class="item-time">${esc(displayTime(row))}</div></div><div class="item-title">${esc(row.title || "—")}</div><div class="item-sub">${esc(row.details || "")}</div></div>`).join("") : `<div class="item"><div class="item-day">${esc(today)}</div><div class="item-sub">No practice today.</div></div>`;
  dailyEl.innerHTML = visible.weekly.length ? visible.weekly.map((row) => `<div class="item"><div class="item-top"><div class="item-day">${esc(row.day || "—")}</div><div class="item-time">${esc(displayTime(row))}</div></div><div class="item-title">${esc(row.title || "—")}</div><div class="item-sub">${esc(row.details || "")}</div></div>`).join("") : `<div class="item"><div class="item-sub">No weekly schedule published for this location.</div></div>`;
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
