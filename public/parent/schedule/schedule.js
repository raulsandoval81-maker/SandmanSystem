import { auth, db, functions, doc, getDoc, httpsCallable } from "/assets/js/firebase-init-para.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { filterScheduleForAthlete, loadPublishedLocationSchedule, resolveScheduleLocation } from "/assets/js/location-schedule.js";

const bannerPanel = document.getElementById("banner-card");
const bannerText = document.getElementById("banner-text");
const todayCard = document.getElementById("today-box");
const weeklyList = document.getElementById("weekly-list");
const eventsList = document.getElementById("events-list");
const lastUpdated = document.getElementById("last-updated");
const getMyAthleteCall = httpsCallable(functions, "getMyAthlete");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const displayTime = (row = {}) => row.label || row.time || (row.start && row.end ? `${row.start} - ${row.end}` : "—");
const dayMatches = (row, day) => String(row?.day || "").toLowerCase().includes(day.toLowerCase());

function render(schedule, athlete) {
  const visible = filterScheduleForAthlete(schedule, athlete);
  const today = DAYS[new Date().getDay()];
  const todayRows = visible.weekly.filter((row) => dayMatches(row, today));

  if (bannerPanel && bannerText) {
    const show = visible.banner?.active === true && String(visible.banner?.text || "").trim();
    bannerPanel.style.display = show ? "" : "none";
    bannerText.textContent = show ? visible.banner.text : "";
  }

  todayCard.innerHTML = todayRows.length ? todayRows.map((row) => `<div class="status-row"><div class="k">${esc(today)}</div><div class="v">${esc(displayTime(row))}</div><div class="k"><span class="en">Session</span><span class="es">Sesión</span></div><div class="v">${esc(row.title || "—")}</div><div class="k"><span class="en">Details</span><span class="es">Detalles</span></div><div class="v">${esc(row.details || "—")}</div></div>`).join("") : `<p class="muted-empty"><span class="en">No scheduled session today.</span><span class="es">No hay sesión programada hoy.</span></p>`;

  weeklyList.innerHTML = visible.weekly.length ? visible.weekly.map((row) => `<div class="item"><div class="item-top"><div class="item-day">${esc(row.day || "—")}</div><div class="item-sub">${esc(displayTime(row))}</div></div><div class="item-title">${esc(row.title || "—")}</div>${row.details ? `<div class="item-sub">${esc(row.details)}</div>` : ""}</div>`).join("") : `<p class="muted-empty"><span class="en">No weekly schedule published for this location.</span><span class="es">No hay horario semanal publicado para esta ubicación.</span></p>`;

  eventsList.innerHTML = visible.events.length ? visible.events.map((event) => `<div class="item"><div class="item-date">${esc(event.date || "—")}</div><div class="item-title">${esc(event.title || "—")}</div>${event.location ? `<div class="item-sub">${esc(event.location)}</div>` : ""}${event.details ? `<div class="item-sub">${esc(event.details)}</div>` : ""}</div>`).join("") : `<p class="muted-empty"><span class="en">No upcoming events published.</span><span class="es">No hay eventos próximos publicados.</span></p>`;

  if (lastUpdated) lastUpdated.textContent = schedule.status === "published" ? `Published schedule — ${schedule.locationName}` : `No published schedule — ${schedule.locationName}`;
}

function waitForUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user || null); });
  });
}

async function start() {
  const user = await waitForUser();
  if (!user || user.isAnonymous) throw new Error("Parent authentication required.");
  const result = await getMyAthleteCall({});
  if (!result.data?.ok || !result.data?.linked || !result.data?.athlete) throw new Error("No authorized athlete is linked.");
  const athlete = result.data.athlete;
  const locationId = resolveScheduleLocation(athlete);
  if (!locationId) throw new Error("The athlete does not have an assigned location.");
  render(await loadPublishedLocationSchedule(db, locationId), athlete);
}

start().catch((error) => {
  console.error("[parent-schedule] load failed", error);
  todayCard.innerHTML = `<p class="muted-empty">${esc(error.message || "Schedule unavailable.")}</p>`;
  weeklyList.innerHTML = "";
  eventsList.innerHTML = "";
});
