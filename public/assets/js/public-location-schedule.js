import { db } from "/assets/js/firebase-init.js";
import { expandScheduleRowsByDay, loadPublishedLocationSchedule, normalizeLocationId, scheduleCategoryLabel, scheduleProviderLabel } from "/assets/js/location-schedule.js";
import { nextScheduledSession, resolveLocationScheduleLiveState } from "/assets/js/location-schedule-live-state.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function groupByDay(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const day = String(row.day || "Schedule");
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(row);
  });
  return groups;
}

async function start() {
  const root = document.querySelector("[data-location-schedule]");
  if (!root) return;
  const locationId = normalizeLocationId(root.dataset.locationSchedule);
  const targets = [...root.querySelectorAll("[data-schedule-grid]")];
  const states = [...root.querySelectorAll("[data-schedule-state]")];
  if (!targets.length) return;

  targets.forEach((target) => {
    const spanish = Boolean(target.closest('[data-lang-block="es"]'));
    target.innerHTML = spanish
      ? `<article class="schedule-card"><h2>Cargando horario…</h2></article>`
      : `<article class="schedule-card"><h2>Loading schedule…</h2></article>`;
  });

  const schedule = await loadPublishedLocationSchedule(db, locationId);

  if (schedule.status !== "published" || !schedule.weekly.length) {
    targets.forEach((target) => {
      const spanish = Boolean(target.closest('[data-lang-block="es"]'));
      target.innerHTML = spanish
        ? `<article class="schedule-card"><h2>Horario no publicado</h2><p>La gerencia aún no ha publicado un horario de entrenamiento para esta ubicación.</p></article>`
        : `<article class="schedule-card"><h2>Schedule not published</h2><p>Management has not published a training schedule for this location yet.</p></article>`;
    });
    states.forEach((state) => { state.textContent = state.closest('[data-lang-block="es"]') ? "Comuníquese con la gerencia para conocer la disponibilidad actual." : "Contact Management for current availability."; });
    return;
  }

  const live = resolveLocationScheduleLiveState(schedule.weekly, new Date(), schedule.timezone);
  const later = live.state === "complete" ? nextScheduledSession(schedule.weekly, new Date(), schedule.timezone) : null;

  targets.forEach((target) => {
    const spanish = Boolean(target.closest('[data-lang-block="es"]'));
    const stateClass = `schedule-state--${live.state}`;
    const stateTitle = live.state === "active" ? (spanish ? "ACTIVO AHORA" : "ACTIVE NOW") : live.state === "next" ? (spanish ? "PRÓXIMA CLASE" : "NEXT CLASS") : live.state === "complete" ? (spanish ? "HORARIO DE HOY COMPLETO" : "TODAY COMPLETE") : (spanish ? "NO HAY CLASE HOY" : "NO CLASS TODAY");
    const stateDetail = live.row ? `${esc(spanish ? (live.row.titleEs || live.row.title) : live.row.title)} • ${esc(live.row.label || live.row.time || "")}${live.state === "next" ? ` • ${spanish ? "Comienza en" : "Starts in"} ${live.minutesUntil} min` : ""}` : later ? `${spanish ? "Próxima" : "Next"}: ${esc(spanish ? (later.row.titleEs || later.row.title) : later.row.title)} • ${esc(later.day)} ${esc(later.row.label || later.row.time || "")}` : (spanish ? "No hay una clase programada hoy." : "No class is scheduled today.");
    target.innerHTML = `<article class="schedule-card schedule-card--today ${stateClass}"><h2>${stateTitle}</h2><p>${stateDetail}</p></article>${[...groupByDay(expandScheduleRowsByDay(schedule.weekly))].map(([day, rows]) => `<article class="schedule-card schedule-card--day"><h2>${esc(spanish ? (rows[0]?.dayEs || day) : day)}</h2>${rows.map((row) => `<div class="schedule-session schedule-category--${esc(row.category || "unknown")} schedule-provider--${esc(row.provider || "unknown")}"><h3 class="schedule-session__title">${esc(spanish ? (row.titleEs || row.title) : row.title)}</h3><p class="schedule-details">${esc(row.details ? (spanish ? (row.detailsEs || row.details) : row.details) : "")}</p><p class="schedule-time">${esc(row.label || row.time || `${row.start || ""}–${row.end || ""}`)}</p><p class="schedule-meta">${esc(scheduleCategoryLabel(row))} • ${esc(scheduleProviderLabel(row))} • ${esc(row.instructor || "Instructor TBA")}</p></div>`).join("")}</article>`).join("")}`;
  });
  states.forEach((state) => { state.textContent = state.closest('[data-lang-block="es"]') ? "Horario publicado por la gerencia de la academia." : "Published by Academy Management."; });
}

start().catch((error) => {
  console.error("[public-location-schedule] load failed", error);
  document.querySelectorAll("[data-schedule-state]").forEach((state) => { state.textContent = "Schedule unavailable. Contact Management for current availability."; });
});
